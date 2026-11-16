import { expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, finish, backup, reopen } from "@test/support/controller.js";
it("defaults schedules off and atomically consumes a due schedule with admission", async () => {
  const f = await fixture();
  expect(Object.values(f.controller.backups.schedules().enabled)).toEqual([
    false,
    false,
    false,
    false,
  ]);
  await f.controller.backups.updateSchedules({
    hourly: true,
    daily: false,
    weekly: false,
    monthly: false,
  });
  f.clock.date = new Date("2026-09-10T19:00:00Z");
  f.controller.start();
  await vi.waitFor(() => expect(f.controller.maintenance.latestOperation()).not.toBeNull(), {
    timeout: 3000,
  });
  const id = f.controller.maintenance.latestOperation()!.id;
  await finish(f.controller, id);
  const state = JSON.parse(await readFile(join(f.root, "backup-state/state.json"), "utf8"));
  expect(state.operations.find((op: { id: string }) => op.id === id).request.origin).toBe(
    "scheduled",
  );
  expect(new Date(state.nextRuns.hourly).getTime()).toBeGreaterThan(f.clock.now().getTime());
  expect((await f.controller.backups.list()).backups[0]?.tiers).toEqual(["hourly"]);
  const reopened = await reopen(f);
  reopened.controller.start();
  await new Promise((r) => setTimeout(r, 1100));
  expect((await reopened.controller.backups.list()).backups).toHaveLength(1);
});
it("coalesces schedules into one snapshot and keeps manual/safety backups out of retention", async () => {
  const f = await fixture(),
    manual = await backup(f.controller);
  await f.controller.backups.updateSchedules({
    hourly: true,
    daily: true,
    weekly: true,
    monthly: true,
  });
  f.clock.date = new Date("2026-12-01T08:00:00Z");
  f.controller.start();
  await vi.waitFor(
    async () =>
      expect(
        (await f.controller.backups.list()).backups.some((b) => b.origin === "scheduled"),
      ).toBe(true),
    { timeout: 4000 },
  );
  const scheduled = (await f.controller.backups.list()).backups.find(
    (b) => b.origin === "scheduled",
  )!;
  expect(scheduled.tiers.sort()).toEqual(["daily", "hourly", "monthly", "weekly"]);
  await finish(f.controller, f.controller.maintenance.latestOperation()!.id);
  expect((await f.controller.backups.list()).backups.some((b) => b.id === manual)).toBe(true);
});
