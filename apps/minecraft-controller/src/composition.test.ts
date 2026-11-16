import { journalSchema } from "@/tasks/operations.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rename, rm, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createController } from "@/composition.js";
import { fixture, finish, takeBackup } from "@/backups/test-fixtures.js";
import { atomicJson, ControllerStore } from "@/state/store.js";
import { ControllerError } from "@/errors.js";

const roots: string[] = [];
async function setup() {
  const f = await fixture();
  roots.push(f.root);
  return f;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("manual backups and recovery", () => {
  it("starts with every schedule disabled and records resolved versions", async () => {
    const { controller } = await setup();
    expect(controller.scheduler.schedules().enabled).toEqual({
      hourly: false,
      daily: false,
      weekly: false,
      monthly: false,
    });
    const id = await takeBackup(controller.backups, controller.maintenance);
    const record = (await controller.backups.list()).backups.find((b) => b.id === id)!;
    expect(record).toMatchObject({
      origin: "manual",
      method: "offline",
      contents: "full",
      version: {
        serverType: "FTBA",
        minecraftVersion: "1.21.1",
        modpackId: "130",
        modpackVersionId: "100440",
      },
    });
    expect(record.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("stops an empty server and restores its running state and restart policy", async () => {
    const { controller, runtime } = await setup();
    await takeBackup(controller.backups, controller.maintenance);
    expect(runtime.calls).toEqual(["policy:no", "stop", "start", "ready", "policy:unless-stopped"]);
  });
  it("backs up a stopped server without starting it", async () => {
    const { controller, runtime } = await setup();
    runtime.state.running = false;
    await takeBackup(controller.backups, controller.maintenance);
    expect(runtime.calls).toEqual([]);
    expect(runtime.commands).toEqual([]);
  });
  it("keeps players online and restores saving", async () => {
    const { controller, runtime } = await setup();
    runtime.players = 1;
    await takeBackup(controller.backups, controller.maintenance);
    expect(runtime.calls).toEqual([]);
    expect(runtime.commands).toEqual(["list", "save-off", "save-all flush", "save-on"]);
    expect((await controller.backups.list()).backups[0]?.method).toBe("online");
  });
  it("never treats an unavailable player count as an empty server", async () => {
    const { controller, runtime } = await setup();
    runtime.commandFailure = "list";
    expect(
      (await finish(controller.maintenance, await controller.backups.create(randomUUID()))).status,
    ).toBe("failed");
    expect(runtime.calls).toEqual([]);
    expect((await controller.backups.list()).backups).toHaveLength(0);
  });
  it("re-enables saving when the flush or archive creation fails", async () => {
    const { controller, runtime } = await setup();
    runtime.players = 1;
    runtime.commandFailure = "save-all flush";
    expect(
      (await finish(controller.maintenance, await controller.backups.create(randomUUID()))).status,
    ).toBe("failed");
    expect(runtime.commands.at(-1)).toBe("save-on");
    runtime.commandFailure = null;
    vi.spyOn(controller.backups.storage, "create").mockRejectedValueOnce(
      new Error("disk write failed"),
    );
    expect(
      (await finish(controller.maintenance, await controller.backups.create(randomUUID()))).status,
    ).toBe("failed");
    expect(runtime.commands.at(-1)).toBe("save-on");
  });
  it("holds maintenance when saving cannot be restored", async () => {
    const { controller, runtime } = await setup();
    runtime.players = 1;
    runtime.commandFailure = "save-on";
    const op = await finish(controller.maintenance, await controller.backups.create(randomUUID()));
    expect(op.status).toBe("recoveryRequired");
    await expect(controller.server.power("start")).rejects.toMatchObject({
      code: "BACKUP_RECOVERY_REQUIRED",
    });
    runtime.commandFailure = null;
    await controller.maintenance.recover();
    expect(controller.maintenance.activeOperation()).toBeNull();
  });
  it("deduplicates requests and refuses overlapping power, delete and RCON operations", async () => {
    const { controller } = await setup();
    const existing = await takeBackup(controller.backups, controller.maintenance);
    const id = randomUUID();
    await controller.backups.create(id);
    expect(await controller.backups.create(id)).toBe(id);
    await expect(controller.server.power("stop")).rejects.toMatchObject({
      code: "MINECRAFT_MAINTENANCE",
    });
    await expect(controller.server.execute("save-on")).rejects.toMatchObject({
      code: "MINECRAFT_MAINTENANCE",
    });
    await expect(controller.backups.delete(existing)).rejects.toMatchObject({
      code: "MINECRAFT_MAINTENANCE",
    });
    await expect(controller.backups.restore(existing, id)).rejects.toMatchObject({
      code: "BACKUP_REQUEST_CONFLICT",
    });
    await finish(controller.maintenance, id);
    expect(await controller.backups.create(id)).toBe(id);
    expect((await controller.backups.list()).backups).toHaveLength(2);
  });
  it("performs a real archive/change/restore drill and preserves current access files", async () => {
    const { controller, data, runtime } = await setup();
    const backup = await takeBackup(controller.backups, controller.maintenance);
    await writeFile(join(data, "world/level.dat"), "later world data");
    await writeFile(join(data, "mods/test.jar"), "later mod contents");
    await writeFile(join(data, "mods/added.jar"), "remove on restore");
    await writeFile(join(data, "whitelist.json"), "new whitelist");
    await writeFile(
      join(data, "server.properties"),
      "level-name=world\nrcon.password=new-secret\nwhite-list=true\ndifficulty=hard\n",
    );
    runtime.players = 2;
    const preview = await controller.backups.preview(backup);
    expect(preview.canRestore).toBe(true);
    expect(preview.onlinePlayers).toBe(2);
    const op = await finish(
      controller.maintenance,
      await controller.backups.restore(backup, randomUUID()),
    );
    expect(op.status).toBe("succeeded");
    expect(await readFile(join(data, "world/level.dat"), "utf8")).toBe("original world data");
    expect(await readFile(join(data, "mods/test.jar"), "utf8")).toBe("original mod contents");
    expect(await readdir(join(data, "mods"))).toEqual(["test.jar"]);
    expect(await readFile(join(data, "whitelist.json"), "utf8")).toBe("new whitelist");
    const properties = await readFile(join(data, "server.properties"), "utf8");
    expect(properties).toContain("rcon.password=new-secret");
    expect(properties).toContain("white-list=true");
    expect(properties).not.toContain("difficulty=hard");
    expect(properties).not.toContain("current-secret");
    expect(runtime.commands.some((c) => c.startsWith("say "))).toBe(true);
    expect(
      (await controller.backups.list()).backups.find((b) => b.id === op.safetyBackupId)?.origin,
    ).toBe("safety");
    expect(runtime.state.running).toBe(true);
  });
  it("restores while stopped without starting Minecraft", async () => {
    const { controller, runtime, data } = await setup();
    runtime.state.running = false;
    const backup = await takeBackup(controller.backups, controller.maintenance);
    await writeFile(join(data, "world/level.dat"), "changed");
    expect(
      (await finish(controller.maintenance, await controller.backups.restore(backup, randomUUID())))
        .status,
    ).toBe("succeeded");
    expect(runtime.state.running).toBe(false);
    expect(runtime.calls).not.toContain("start");
  });
  it("rolls back the data if the restored server fails to start", async () => {
    const { controller, runtime, data } = await setup();
    const backup = await takeBackup(controller.backups, controller.maintenance);
    await writeFile(join(data, "world/level.dat"), "current data must survive");
    runtime.readyFailures = 1;
    const op = await finish(
      controller.maintenance,
      await controller.backups.restore(backup, randomUUID()),
    );
    expect(op.status).toBe("failed");
    expect(await readFile(join(data, "world/level.dat"), "utf8")).toBe("current data must survive");
    expect(runtime.state.running).toBe(true);
    expect(runtime.state.restartPolicy.Name).toBe("unless-stopped");
  });
  it("rejects mismatched and floating versions before stopping or replacing files", async () => {
    const { controller, runtime } = await setup();
    const backup = await takeBackup(controller.backups, controller.maintenance);
    runtime.calls = [];
    runtime.state.env.FTB_MODPACK_VERSION_ID = "different";
    expect((await controller.backups.preview(backup)).canRestore).toBe(false);
    expect(
      (await finish(controller.maintenance, await controller.backups.restore(backup, randomUUID())))
        .status,
    ).toBe("failed");
    expect(runtime.calls).toEqual([]);
  });
  it("keeps Minecraft stopped when neither restored nor original data can become ready", async () => {
    const { controller, runtime, data } = await setup();
    const backup = await takeBackup(controller.backups, controller.maintenance);
    await writeFile(join(data, "world/level.dat"), "current data must survive");
    runtime.readyFailures = 2;
    const op = await finish(
      controller.maintenance,
      await controller.backups.restore(backup, randomUUID()),
    );
    expect(op.status).toBe("recoveryRequired");
    expect(await readFile(join(data, "world/level.dat"), "utf8")).toBe("current data must survive");
    expect(runtime.state.running).toBe(false);
    expect(runtime.state.restartPolicy.Name).toBe("no");
    await expect(controller.server.power("start")).rejects.toMatchObject({
      code: "BACKUP_RECOVERY_REQUIRED",
    });
    await controller.maintenance.recover();
    expect(runtime.state.running).toBe(true);
    expect(runtime.state.restartPolicy.Name).toBe("unless-stopped");
  });
  it("rejects corruption before stopping the server", async () => {
    const { controller, runtime } = await setup();
    const backup = await takeBackup(controller.backups, controller.maintenance);
    runtime.calls = [];
    await writeFile(
      join(controller.backups.storage.directory(backup), "archive.tar.gz"),
      "corrupt",
    );
    expect(
      (await finish(controller.maintenance, await controller.backups.restore(backup, randomUUID())))
        .status,
    ).toBe("failed");
    expect(runtime.calls).toEqual([]);
  });
  it("does not replace data if safety backup creation fails", async () => {
    const { controller, data } = await setup();
    const backup = await takeBackup(controller.backups, controller.maintenance);
    await writeFile(join(data, "world/level.dat"), "current data");
    vi.spyOn(controller.backups.storage, "create").mockRejectedValueOnce(
      new ControllerError("BACKUP_STORAGE_FULL", "No space"),
    );
    expect(
      (await finish(controller.maintenance, await controller.backups.restore(backup, randomUUID())))
        .status,
    ).toBe("failed");
    expect(await readFile(join(data, "world/level.dat"), "utf8")).toBe("current data");
  });
  it("recovers a controller interruption halfway through replacement before accepting commands", async () => {
    const { controller, options, runtime, root, data } = await setup();
    const backup = await takeBackup(controller.backups, controller.maintenance);
    const id = randomUUID();
    const work = join(root, "backup-recovery", id);
    await mkdir(join(work, "previous"), { recursive: true });
    await mkdir(join(work, "staged"));
    await rename(join(data, "world"), join(work, "previous/world"));
    await mkdir(join(data, "world"));
    await writeFile(join(data, "world/level.dat"), "partial replacement");
    const state = JSON.parse(await readFile(join(root, "backup-state/state.json"), "utf8"));
    state.operations.push({
      id,
      kind: "restore",
      status: "running",
      phase: "Replacing server data",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      backupId: backup,
      safetyBackupId: null,
      error: null,
      containerId: runtime.state.containerId,
      wasRunning: true,
      restartPolicy: { Name: "unless-stopped" },
      stoppedByOperation: true,
      replacementStarted: true,
      originalNames: ["world"],
      stagedNames: ["world"],
    });
    await atomicJson(join(root, "backup-state/state.json"), state);
    runtime.state.running = false;
    runtime.state.restartPolicy = { Name: "no" };
    const recovered = createController(options);
    await recovered.initialize();
    expect(recovered.maintenance.activeOperation()).toBeNull();
    expect(await readFile(join(data, "world/level.dat"), "utf8")).toBe("original world data");
    expect(runtime.state.running).toBe(true);
    expect(runtime.state.restartPolicy.Name).toBe("unless-stopped");
    expect(recovered.maintenance.operation(id).status).toBe("failed");
  });
  it("recovers saving after a controller restart", async () => {
    const { options, runtime, root } = await setup();
    const state = JSON.parse(await readFile(join(root, "backup-state/state.json"), "utf8"));
    state.operations.push({
      id: randomUUID(),
      kind: "backup",
      status: "running",
      phase: "Creating archive",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      backupId: null,
      safetyBackupId: null,
      error: null,
      containerId: runtime.state.containerId,
      wasRunning: true,
      savingDisabled: true,
    });
    await atomicJson(join(root, "backup-state/state.json"), state);
    const recovered = createController(options);
    await recovered.initialize();
    expect(runtime.commands).toEqual(["save-on"]);
    expect(recovered.maintenance.activeOperation()).toBeNull();
  });
  it("holds startup without touching live files when the recorded container changes", async () => {
    const { options, runtime, root, data } = await setup();
    const store = new ControllerStore(join(root, "backup-state"));
    const state = await store.load(options.timezone);
    state.operations.push(
      journalSchema.parse({
        id: randomUUID(),
        kind: "restore",
        taskVersion: 1,
        status: "running",
        phase: "Replacing server data",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        backupId: null,
        safetyBackupId: null,
        error: null,
        containerId: "a-different-container",
        wasRunning: true,
        stoppedByOperation: true,
        replacementStarted: true,
      }),
    );
    await store.save(state);
    const gate = {
      block: vi.fn(async () => {}),
      open: vi.fn(async () => {}),
      boot: async <T>(_container: string, action: () => Promise<T>) => action(),
    };
    const recovered = createController({ ...options, startupGate: gate });
    await recovered.initialize();
    expect(recovered.maintenance.activeOperation()?.status).toBe("recoveryRequired");
    expect(gate.open).not.toHaveBeenCalled();
    expect(runtime.calls).toEqual([]);
    expect(await readFile(join(data, "world/level.dat"), "utf8")).toBe("original world data");
  });
});
