// Opt-in end-to-end drill. Creates its own labelled container and temporary
// data directory; never discovers or controls the configured Minecraft stack.
import Dockerode from "dockerode";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { DockerClient } from "@/runtime/docker-client.js";
import { DockerMinecraftRuntime } from "@/runtime/minecraft-runtime.js";
import { createController, type ControllerApplication } from "@/composition.js";

const socketPath = process.env.BACKUP_DRILL_DOCKER_SOCKET ?? "/var/run/docker.sock";
const docker = new Dockerode({ socketPath });
const project = `codex-backup-drill-${randomUUID().slice(0, 8)}`;
const root = await mkdtemp(join(tmpdir(), "minecraft-docker-drill-"));
const data = join(root, "minecraft");
await mkdir(data);
await mkdir(join(root, "startup-gate/requests"), { recursive: true });
await mkdir(join(root, "startup-gate/permits"), { recursive: true });
const wrapper = new URL("../../../docker/minecraft/startup-gate.sh", import.meta.url).pathname;
let container: Dockerode.Container | undefined;
let controller: ControllerApplication | undefined;
try {
  container = await docker.createContainer({
    name: project,
    Image: "itzg/minecraft-server:latest",
    Entrypoint: ["/bin/sh", "/startup-gate.sh"],
    Labels: {
      "com.docker.compose.project": project,
      "com.docker.compose.service": "minecraft",
      "codex.backup-drill": "true",
    },
    Env: [
      "EULA=TRUE",
      "TYPE=VANILLA",
      "VERSION=1.21.1",
      "MEMORY=1G",
      "ENABLE_RCON=true",
      `RCON_PASSWORD=${randomUUID()}`,
      `UID=${String(process.getuid?.() ?? 1000)}`,
      `GID=${String(process.getgid?.() ?? 1000)}`,
      "LEVEL=world",
      "VIEW_DISTANCE=3",
      "SIMULATION_DISTANCE=3",
      "MAX_TICK_TIME=-1",
    ],
    HostConfig: {
      Binds: [
        `${data}:/data`,
        `${wrapper}:/startup-gate.sh:ro`,
        `${root}/startup-gate/requests:/startup-requests`,
        `${root}/startup-gate/permits:/startup-permits:ro`,
      ],
      RestartPolicy: { Name: "no" },
      Memory: 2 * 1024 * 1024 * 1024,
    },
  });
  const client = new DockerClient({ docker, projectName: project, serviceName: "minecraft" });
  const runtime = new DockerMinecraftRuntime(client, docker);
  controller = createController({
    dataRoot: root,
    runtime,
    timezone: "America/Edmonton",
    retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
  });
  await controller.initialize();
  await controller.server.power("start");
  console.log("Disposable Minecraft container authorized; checking readiness.");
  await runtime.waitReady();
  await runtime.execute("forceload add 0 0");
  await delay(2000);
  await runtime.execute("setblock 0 100 0 minecraft:stone");
  assert.match(await runtime.execute("execute if block 0 100 0 minecraft:stone"), /Test passed/);
  await mkdir(join(data, "mods"), { recursive: true });
  await writeFile(join(data, "mods/backup-drill.txt"), "original server file");
  async function finish(id: string) {
    const deadline = Date.now() + 15 * 60_000;
    let phase = "";
    while (Date.now() < deadline) {
      const op = controller!.maintenance.operation(id);
      if (op.phase !== phase) {
        console.log(op.phase);
        phase = op.phase;
      }
      if (op.status !== "running") {
        assert.equal(op.status, "succeeded", op.error ?? "Operation failed");
        return op;
      }
      await delay(500);
    }
    throw new Error("The disposable drill exceeded its operation deadline.");
  }
  const backup = await finish(await controller.backups.create(randomUUID()));
  assert.ok(backup.backupId);
  await runtime.execute("setblock 0 100 0 minecraft:gold_block");
  assert.match(
    await runtime.execute("execute if block 0 100 0 minecraft:gold_block"),
    /Test passed/,
  );
  await writeFile(join(data, "mods/backup-drill.txt"), "changed server file");
  const preview = await controller.backups.preview(backup.backupId);
  assert.ok(preview.canRestore, preview.reasons.join(" "));
  const restored = await finish(await controller.backups.restore(backup.backupId, randomUUID()));
  assert.ok(restored.safetyBackupId);
  assert.equal(await readFile(join(data, "mods/backup-drill.txt"), "utf8"), "original server file");
  assert.match(await runtime.execute("execute if block 0 100 0 minecraft:stone"), /Test passed/);
  console.log(
    "PASS: real Minecraft world and server files restored; safety backup retained; RCON ready.",
  );
} finally {
  if (controller) await controller.close();
  if (container) await container.remove({ force: true });
  await rm(root, { recursive: true, force: true });
  console.log("Disposable container and test data removed.");
}
