import { crc32 } from "node:zlib";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { BackupManager, type BackupManagerOptions } from "./manager.js";
import type { BackupRuntime, RuntimeState } from "./runtime.js";
import type { RestartPolicy } from "./store.js";

export class FakeRuntime implements BackupRuntime {
  public state: RuntimeState = {
    containerId: "test-container",
    running: true,
    env: { TYPE: "FTBA", LEVEL: "world", FTB_MODPACK_ID: "130", FTB_MODPACK_VERSION_ID: "100440" },
    restartPolicy: { Name: "unless-stopped" },
  };
  public players = 0;
  public commands: string[] = [];
  public calls: string[] = [];
  public readyFailures = 0;
  public commandFailure: string | null = null;
  public onReady: (() => Promise<void>) | undefined;
  public async inspect() {
    return structuredClone(this.state);
  }
  public async execute(command: string) {
    this.commands.push(command);
    if (command === this.commandFailure) throw new Error("RCON offline");
    if (command === "list")
      return `There are ${String(this.players)} of a max of 20 players online: ${this.players ? "Alex" : ""}`;
    if (command === "save-off") return "Automatic saving is now disabled";
    if (command === "save-on") return "Automatic saving is now enabled";
    if (command === "save-all flush") return "Saved the game";
    return "Done";
  }
  public async stop() {
    this.calls.push("stop");
    this.state.running = false;
  }
  public async start() {
    this.calls.push("start");
    this.state.running = true;
  }
  public async setRestartPolicy(policy: RestartPolicy) {
    this.calls.push(`policy:${policy.Name}`);
    this.state.restartPolicy = policy;
  }
  public async waitReady() {
    this.calls.push("ready");
    if (this.onReady) await this.onReady();
    if (this.readyFailures-- > 0) throw new Error("Minecraft failed to boot");
  }
}

export async function fixture(overrides: Partial<BackupManagerOptions> = {}) {
  const root = await mkdtemp(join(tmpdir(), "minecraft-backup-test-"));
  const data = join(root, "minecraft");
  await mkdir(join(data, "world"), { recursive: true });
  await mkdir(join(data, "mods"));
  await writeFile(join(data, "world/level.dat"), "original world data");
  await writeFile(join(data, "mods/test.jar"), "original mod contents");
  await writeFile(
    join(data, "server.properties"),
    "level-name=world\nrcon.password=current-secret\n",
  );
  await writeFile(join(data, "whitelist.json"), "current whitelist");
  await writeFile(join(data, ".ftb-installed"), "130=100440\n");
  await writeFile(
    join(data, ".manifest.json"),
    JSON.stringify({
      id: 130,
      versionId: 100440,
      modPackTargets: { mcVersion: "1.21.1", modLoader: { name: "neoforge", version: "21.1.243" } },
    }),
  );
  const runtime = new FakeRuntime();
  const options: BackupManagerOptions = {
    dataRoot: root,
    runtime,
    timezone: "America/Edmonton",
    retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
    countdown: async () => {},
    ...overrides,
  };
  const manager = new BackupManager(options);
  await manager.initialize();
  return { root, data, runtime, manager, options };
}

export async function finish(manager: BackupManager, id: string) {
  await vi.waitFor(
    () => {
      if (manager.operation(id).status === "running") throw new Error("still running");
    },
    { timeout: 10_000, interval: 10 },
  );
  return manager.operation(id);
}
export async function takeBackup(manager: BackupManager) {
  const operation = await finish(manager, await manager.create(randomUUID()));
  if (operation.status !== "succeeded" || !operation.backupId)
    throw new Error(JSON.stringify(operation));
  return operation.backupId;
}

// A one-entry, uncompressed ZIP keeps malformed path/CRC fixtures deterministic.
export function storedZip(name: string, content: string): Buffer {
  const filename = Buffer.from(name);
  const data = Buffer.from(content);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + data.length, 16);
  return Buffer.concat([local, filename, data, central, filename, end]);
}
