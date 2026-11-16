import { afterEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createController } from "@/composition.js";
import { fixture, finish, takeBackup } from "./test-fixtures.js";
import { ControllerStore } from "@/state/store.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("durable scheduler", () => {
  it("does not prune before the success record is durable", async () => {
    let now = new Date("2026-09-10T18:30:00Z");
    const { controller, root } = await fixture({
      now: () => now,
      retention: { hourly: 1, daily: 1, weekly: 1, monthly: 1 },
    });
    roots.push(root);
    await controller.scheduler.updateSchedules({
      hourly: true,
      daily: false,
      weekly: false,
      monthly: false,
    });
    now = new Date("2026-09-10T19:00:00Z");
    await controller.scheduler.tick();
    await finish(controller.maintenance, controller.maintenance.activeOperation()!.id);
    const previous = (await controller.backups.list()).backups[0]!.id;
    const save = ControllerStore.prototype.save;
    let injected = false;
    vi.spyOn(ControllerStore.prototype, "save").mockImplementation(function (
      this: ControllerStore,
      state,
    ) {
      if (!injected && state.operations.at(-1)?.status === "succeeded") {
        injected = true;
        return Promise.reject(new Error("Journal disk full"));
      }
      return save.call(this, state);
    });
    now = new Date("2026-09-10T20:00:00Z");
    await controller.scheduler.tick();
    expect(
      (await finish(controller.maintenance, controller.maintenance.activeOperation()!.id)).status,
    ).toBe("recoveryRequired");
    expect(
      (await controller.backups.list()).backups.find((backup) => backup.id === previous)?.tiers,
    ).toEqual(["hourly"]);
    await expect(controller.backups.storage.verify(previous)).resolves.toBeDefined();
  });
  it("does not let a backup with failed restart cleanup displace a successful archive", async () => {
    let now = new Date("2026-09-10T18:30:00Z");
    const { controller, runtime, root } = await fixture({
      now: () => now,
      retention: { hourly: 2, daily: 1, weekly: 1, monthly: 1 },
    });
    roots.push(root);
    await controller.scheduler.updateSchedules({
      hourly: true,
      daily: false,
      weekly: false,
      monthly: false,
    });
    now = new Date("2026-09-10T19:00:00Z");
    await controller.scheduler.tick();
    await finish(controller.maintenance, controller.maintenance.activeOperation()!.id);
    const successful = (await controller.backups.list()).backups[0]!.id;
    runtime.readyFailures = 1;
    now = new Date("2026-09-10T20:00:00Z");
    await controller.scheduler.tick();
    const failed = await finish(
      controller.maintenance,
      controller.maintenance.activeOperation()!.id,
    );
    expect(failed.status).toBe("failed");
    now = new Date("2026-09-10T21:00:00Z");
    await controller.scheduler.tick();
    await finish(controller.maintenance, controller.maintenance.activeOperation()!.id);
    const records = (await controller.backups.list()).backups;
    expect(records.map((record) => record.id)).toContain(successful);
    expect(records.map((record) => record.id)).not.toContain(failed.backupId);
    expect(records).toHaveLength(2);
  });
  it("coalesces all four schedules and collapses missed periods across restart", async () => {
    let now = new Date("2026-05-31T20:00:00Z");
    const { controller, root, options } = await fixture({ now: () => now });
    roots.push(root);
    await controller.scheduler.updateSchedules({
      hourly: true,
      daily: true,
      weekly: true,
      monthly: true,
    });
    now = new Date("2026-06-01T06:00:00Z");
    await controller.scheduler.tick();
    const active = controller.maintenance.activeOperation()!;
    await controller.scheduler.tick();
    await finish(controller.maintenance, active.id);
    expect((await controller.backups.list()).backups[0]?.tiers).toEqual([
      "hourly",
      "daily",
      "weekly",
      "monthly",
    ]);
    const restarted = createController(options);
    await restarted.initialize();
    await restarted.scheduler.tick();
    expect(restarted.maintenance.activeOperation()).toBeNull();
    now = new Date("2026-08-05T10:00:00Z");
    await restarted.scheduler.tick();
    await finish(restarted.maintenance, restarted.maintenance.activeOperation()!.id);
    await restarted.scheduler.tick();
    expect(restarted.maintenance.activeOperation()).toBeNull();
    expect((await restarted.backups.list()).backups).toHaveLength(2);
    expect(
      Object.values(restarted.scheduler.schedules().nextRuns).every(
        (t) => t !== null && new Date(t).getTime() > now.getTime(),
      ),
    ).toBe(true);
  });
  it("prunes only successful scheduled backups and keeps manual backups", async () => {
    let now = new Date("2026-09-10T18:30:00Z");
    const { controller, runtime, root } = await fixture({
      now: () => now,
      retention: { hourly: 1, daily: 1, weekly: 1, monthly: 1 },
    });
    roots.push(root);
    const manual = await takeBackup(controller.backups, controller.maintenance);
    await controller.scheduler.updateSchedules({
      hourly: true,
      daily: false,
      weekly: false,
      monthly: false,
    });
    now = new Date("2026-09-10T19:00:00Z");
    await controller.scheduler.tick();
    await finish(controller.maintenance, controller.maintenance.activeOperation()!.id);
    const first = (await controller.backups.list()).backups.find(
      (b) => b.origin === "scheduled",
    )!.id;
    runtime.commandFailure = "list";
    now = new Date("2026-09-10T20:00:00Z");
    await controller.scheduler.tick();
    await finish(controller.maintenance, controller.maintenance.activeOperation()!.id);
    expect((await controller.backups.list()).backups.map((b) => b.id)).toContain(first);
    runtime.commandFailure = null;
    now = new Date("2026-09-10T21:00:00Z");
    await controller.scheduler.tick();
    await finish(controller.maintenance, controller.maintenance.activeOperation()!.id);
    const records = (await controller.backups.list()).backups;
    expect(records).toHaveLength(2);
    expect(records.map((b) => b.id)).toContain(manual);
    expect(records.map((b) => b.id)).not.toContain(first);
    await controller.scheduler.updateSchedules({
      hourly: false,
      daily: false,
      weekly: false,
      monthly: false,
    });
    now = new Date("2026-09-11T21:00:00Z");
    await controller.scheduler.tick();
    expect((await controller.backups.list()).backups).toHaveLength(2);
    expect(
      (await finish(controller.maintenance, await controller.backups.create(randomUUID()))).status,
    ).toBe("succeeded");
    expect((await controller.backups.list()).backups).toHaveLength(3);
  });
});
