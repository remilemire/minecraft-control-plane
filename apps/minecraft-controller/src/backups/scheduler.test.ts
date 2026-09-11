import { afterEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { BackupManager } from "./manager.js";
import { fixture, finish, takeBackup } from "./test-fixtures.js";
import { BackupStore } from "./store.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("durable scheduler", () => {
  it("does not prune before the success record is durable", async () => {
    let now = new Date("2026-09-10T18:30:00Z");
    const { manager, root } = await fixture({
      now: () => now,
      retention: { hourly: 1, daily: 1, weekly: 1, monthly: 1 },
    });
    roots.push(root);
    await manager.updateSchedules({ hourly: true, daily: false, weekly: false, monthly: false });
    now = new Date("2026-09-10T19:00:00Z");
    await manager.tick();
    await finish(manager, manager.activeOperation()!.id);
    const previous = (await manager.list()).backups[0]!.id;
    const save = BackupStore.prototype.save;
    let injected = false;
    vi.spyOn(BackupStore.prototype, "save").mockImplementation(function (this: BackupStore, state) {
      if (!injected && state.operations.at(-1)?.status === "succeeded") {
        injected = true;
        return Promise.reject(new Error("Journal disk full"));
      }
      return save.call(this, state);
    });
    now = new Date("2026-09-10T20:00:00Z");
    await manager.tick();
    expect((await finish(manager, manager.activeOperation()!.id)).status).toBe("failed");
    expect((await manager.list()).backups.find((backup) => backup.id === previous)?.tiers).toEqual([
      "hourly",
    ]);
    await expect(manager.storage.verify(previous)).resolves.toBeDefined();
  });
  it("does not let a backup with failed restart cleanup displace a successful archive", async () => {
    let now = new Date("2026-09-10T18:30:00Z");
    const { manager, runtime, root } = await fixture({
      now: () => now,
      retention: { hourly: 2, daily: 1, weekly: 1, monthly: 1 },
    });
    roots.push(root);
    await manager.updateSchedules({ hourly: true, daily: false, weekly: false, monthly: false });
    now = new Date("2026-09-10T19:00:00Z");
    await manager.tick();
    await finish(manager, manager.activeOperation()!.id);
    const successful = (await manager.list()).backups[0]!.id;
    runtime.readyFailures = 1;
    now = new Date("2026-09-10T20:00:00Z");
    await manager.tick();
    const failed = await finish(manager, manager.activeOperation()!.id);
    expect(failed.status).toBe("failed");
    now = new Date("2026-09-10T21:00:00Z");
    await manager.tick();
    await finish(manager, manager.activeOperation()!.id);
    const records = (await manager.list()).backups;
    expect(records.map((record) => record.id)).toContain(successful);
    expect(records.map((record) => record.id)).not.toContain(failed.backupId);
    expect(records).toHaveLength(2);
  });
  it("coalesces all four schedules and collapses missed periods across restart", async () => {
    let now = new Date("2026-05-31T20:00:00Z");
    const { manager, root, options } = await fixture({ now: () => now });
    roots.push(root);
    await manager.updateSchedules({ hourly: true, daily: true, weekly: true, monthly: true });
    now = new Date("2026-06-01T06:00:00Z");
    await manager.tick();
    const active = manager.activeOperation()!;
    await manager.tick();
    await finish(manager, active.id);
    expect((await manager.list()).backups[0]?.tiers).toEqual([
      "hourly",
      "daily",
      "weekly",
      "monthly",
    ]);
    const restarted = new BackupManager(options);
    await restarted.initialize();
    await restarted.tick();
    expect(restarted.activeOperation()).toBeNull();
    now = new Date("2026-08-05T10:00:00Z");
    await restarted.tick();
    await finish(restarted, restarted.activeOperation()!.id);
    await restarted.tick();
    expect(restarted.activeOperation()).toBeNull();
    expect((await restarted.list()).backups).toHaveLength(2);
    expect(
      Object.values(restarted.schedules().nextRuns).every(
        (t) => t !== null && new Date(t).getTime() > now.getTime(),
      ),
    ).toBe(true);
  });
  it("prunes only successful scheduled backups and keeps manual backups", async () => {
    let now = new Date("2026-09-10T18:30:00Z");
    const { manager, runtime, root } = await fixture({
      now: () => now,
      retention: { hourly: 1, daily: 1, weekly: 1, monthly: 1 },
    });
    roots.push(root);
    const manual = await takeBackup(manager);
    await manager.updateSchedules({ hourly: true, daily: false, weekly: false, monthly: false });
    now = new Date("2026-09-10T19:00:00Z");
    await manager.tick();
    await finish(manager, manager.activeOperation()!.id);
    const first = (await manager.list()).backups.find((b) => b.origin === "scheduled")!.id;
    runtime.commandFailure = "list";
    now = new Date("2026-09-10T20:00:00Z");
    await manager.tick();
    await finish(manager, manager.activeOperation()!.id);
    expect((await manager.list()).backups.map((b) => b.id)).toContain(first);
    runtime.commandFailure = null;
    now = new Date("2026-09-10T21:00:00Z");
    await manager.tick();
    await finish(manager, manager.activeOperation()!.id);
    const records = (await manager.list()).backups;
    expect(records).toHaveLength(2);
    expect(records.map((b) => b.id)).toContain(manual);
    expect(records.map((b) => b.id)).not.toContain(first);
    await manager.updateSchedules({ hourly: false, daily: false, weekly: false, monthly: false });
    now = new Date("2026-09-11T21:00:00Z");
    await manager.tick();
    expect((await manager.list()).backups).toHaveLength(2);
    expect((await finish(manager, await manager.create(randomUUID()))).status).toBe("succeeded");
    expect((await manager.list()).backups).toHaveLength(3);
  });
});
