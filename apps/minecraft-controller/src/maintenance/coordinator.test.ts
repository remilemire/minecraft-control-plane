import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import { StateService } from "@/state/service.js";
import { systemClock } from "@/time.js";
import { TestMinecraft, deferred } from "@test/support/controller.js";
import { MaintenanceCoordinator } from "./coordinator.js";
import { defineTask, validateTaskRecord } from "./task.js";
import { StartupGate } from "./startup-gate.js";
import type { TaskContext } from "./contracts.js";
const roots: { root: string; engine: MaintenanceCoordinator; gate: StartupGate }[] = [];
afterEach(async () => {
  for (const item of roots.splice(0)) {
    await item.engine.close();
    await item.gate.close();
    await rm(item.root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "maintenance-engine-")),
    runtime = new TestMinecraft(root),
    gate = new StartupGate(join(root, "startup-gate"), runtime);
  const controls = {
    applyCount: 0,
    recoverCount: 0,
    cleanupCount: 0,
    holdCount: 0,
    available: true,
    verified: true,
    cleanupFailures: 0,
    recoveryFailures: 0,
    applyError: null as Error | null,
    pause: null as ReturnType<typeof deferred> | null,
    captured: null as TaskContext<Record<string, never>, { safe: boolean }> | null,
  };
  const data = join(root, "resource"),
    safety = join(root, "safety"),
    stateRoot = join(root, "backup-state");
  await writeFile(data, "before");
  const task = defineTask({
    kind: "synthetic",
    version: 2,
    request: z.record(z.string(), z.never()),
    state: z.object({ safe: z.boolean().default(false) }),
    initial: () => ({ safe: false }),
    canBoot: (state) => state.safe,
    destructive: true,
    async safetyBackup(ctx) {
      await writeFile(safety, await readFile(data));
      await ctx.step("safety-created", { safe: true });
    },
    verifiedSafety: (state) => state.safe && controls.verified,
    async apply(ctx) {
      controls.captured = ctx;
      controls.applyCount++;
      const stored = JSON.parse(await readFile(join(stateRoot, "state.json"), "utf8"));
      expect(stored.operations.at(-1).checkpoint).toBe("safety-ready");
      if (controls.pause) await controls.pause.promise;
      if (controls.applyError) throw controls.applyError;
      await writeFile(data, "after");
    },
    async recover() {
      controls.recoverCount++;
      if (controls.recoveryFailures-- > 0)
        throw Object.assign(new Error("Docker offline during recovery"), { code: "ECONNREFUSED" });
      await writeFile(data, await readFile(safety));
    },
    async hold() {
      controls.holdCount++;
    },
    async cleanup() {
      controls.cleanupCount++;
      if (controls.cleanupFailures-- > 0) throw new Error("Cleanup IO failure");
    },
  });
  const tasks = new Map([[task.kind, task]]),
    state = new StateService(stateRoot, "UTC", (record) => validateTaskRecord(tasks, record));
  await gate.initialize();
  await state.initialize();
  const engine = new MaintenanceCoordinator(state.journal(), tasks, gate, systemClock, {
    available: async () => {
      if (!controls.available) throw new Error("Unavailable");
    },
    reconcile: async () => {
      if (!state.journal().healthy()) await state.reopen();
    },
  });
  roots.push({ root, engine, gate });
  await engine.initialize();
  return { root, engine, state, controls, data };
}
it("executes a new destructive task only after its safety checkpoint is durable", async () => {
  const f = await fixture(),
    id = await f.engine.submit("synthetic", {});
  await f.engine.wait(id);
  expect(await readFile(f.data, "utf8")).toBe("after");
  expect(f.engine.operation(id)?.status).toBe("succeeded");
  expect(f.controls.applyCount).toBe(1);
  expect(f.controls.cleanupCount).toBe(1);
});
it("holds instead of applying a task without verified safety", async () => {
  const f = await fixture();
  f.controls.verified = false;
  const id = await f.engine.submit("synthetic", {});
  await f.engine.wait(id);
  expect(f.controls.applyCount).toBe(0);
  expect(f.controls.holdCount).toBe(1);
  expect(f.engine.operation(id)?.status).toBe("recoveryRequired");
  expect(await readFile(f.data, "utf8")).toBe("before");
});
it("deduplicates durable admission and rejects overlapping commands", async () => {
  const f = await fixture(),
    id = randomUUID();
  f.controls.pause = deferred();
  const first = f.engine.submit("synthetic", {}, id),
    duplicate = f.engine.submit("synthetic", {}, id);
  expect(await duplicate).toBe(await first);
  await expect(f.engine.exclusive(async () => {})).rejects.toMatchObject({
    code: "MINECRAFT_MAINTENANCE",
  });
  f.controls.pause.resolve(undefined);
  await f.engine.wait(id);
  expect(f.controls.applyCount).toBe(1);
  expect(f.state.journal().all()).toHaveLength(1);
});
it("retains a committed result and retries cleanup without rollback", async () => {
  const f = await fixture();
  f.controls.cleanupFailures = 1;
  const id = await f.engine.submit("synthetic", {});
  await f.engine.wait(id);
  expect(f.engine.operation(id)?.status).toBe("succeeded");
  expect(f.engine.status(f.engine.operation(id)!)).toBe("recoveryRequired");
  await f.engine.recover();
  expect(f.controls.recoverCount).toBe(0);
  expect(f.controls.cleanupCount).toBe(2);
  expect(await readFile(f.data, "utf8")).toBe("after");
  expect(f.engine.active()).toBeNull();
});
it("waits for reconnection and recovers without replaying application, including a second outage", async () => {
  const f = await fixture();
  f.controls.applyError = Object.assign(new Error("Docker offline"), { code: "ECONNREFUSED" });
  f.controls.available = false;
  const id = await f.engine.submit("synthetic", {});
  await f.engine.wait(id);
  expect(f.engine.operation(id)?.recoverOnReconnect).toBe(true);
  await f.engine.retry();
  expect(f.controls.recoverCount).toBe(0);
  f.controls.available = true;
  f.controls.recoveryFailures = 1;
  await expect(f.engine.retry()).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
  expect(f.engine.failure).toBeNull();
  expect(f.engine.operation(id)?.recoverOnReconnect).toBe(true);
  await f.engine.retry();
  expect(f.controls.applyCount).toBe(1);
  expect(f.controls.recoverCount).toBe(2);
  expect(f.engine.active()).toBeNull();
  expect(await readFile(f.data, "utf8")).toBe("before");
});
it("expires execution capabilities after completion and never exposes mutable task state", async () => {
  const f = await fixture(),
    id = await f.engine.submit("synthetic", {});
  await f.engine.wait(id);
  const lease = f.controls.captured!;
  expect(Reflect.set(lease.state(), "safe", false)).toBe(false);
  expect(() => lease.assertActive()).toThrow("lease");
  await expect(lease.step("late", { safe: false })).rejects.toMatchObject({
    code: "MINECRAFT_MAINTENANCE",
  });
});
it("holds a real admission write failure without running task side effects", async () => {
  const f = await fixture(),
    path = join(f.root, "backup-state/state.json"),
    saved = join(f.root, "saved.json");
  await rename(path, saved);
  await mkdir(path);
  await expect(f.engine.submit("synthetic", {})).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  expect(f.controls.applyCount).toBe(0);
  await expect(f.engine.exclusive(async () => {})).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  await rm(path, { recursive: true });
  await rename(saved, path);
  await f.engine.recover();
  expect(await f.engine.exclusive(async () => "available")).toBe("available");
});
