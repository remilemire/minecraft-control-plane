import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { fixture, backup, reopen, finish } from "@test/support/controller.js";
import { ArchiveStorage } from "@/backups/archive.js";
import { stateSchema } from "@/state/model.js";
import { atomicJson } from "@/filesystem/atomic-files.js";
import { preserved } from "@/data/policy.js";

it.each([0, 1, 2])("recovers an interrupted native restore journal version %i", async (version) => {
  const f = await fixture(),
    id = await backup(f.controller);
  await f.controller.close();
  await f.runtime.stop();
  await writeFile(join(f.data, "world/level.dat"), "pre-task B");
  const path = join(f.root, "backup-state/state.json"),
    state = stateSchema.parse(JSON.parse(await readFile(path, "utf8"))),
    archive = new ArchiveStorage(join(f.root, "backups"));
  const safety = await archive.create(f.data, {
    id: randomUUID(),
    createdAt: f.clock.now().toISOString(),
    origin: "safety",
    contents: "full",
    method: "offline",
    tiers: [],
    version: state.backups.find((b) => b.id === id)!.version,
    worldName: "world",
  });
  state.backups.push(safety);
  const operation = randomUUID(),
    work = join(f.root, "backup-recovery", operation),
    staged = join(work, "staged"),
    previous = join(work, "previous");
  await mkdir(staged, { recursive: true });
  await mkdir(previous);
  await archive.verify(id, staged);
  const originalNames = (await readdir(f.data)).filter((n) => !preserved(n)),
    stagedNames = (await readdir(staged)).filter((n) => !preserved(n));
  const data = {
    containerId: f.runtime.state.containerId,
    wasRunning: true,
    restartPolicy: { Name: "unless-stopped" },
    stoppedByOperation: true,
    savingDisabled: false,
    replacementStarted: true,
    replacementComplete: false,
    originalNames,
    stagedNames,
    liveDataSafe: false,
    rollbackPending: false,
    safetyBackupId: safety.id,
    safetyVerified: true,
  };
  state.operations.push({
    id: operation,
    kind: "restore",
    taskVersion: 2,
    request: { backupId: id },
    data,
    result: { backupId: id, safetyBackupId: safety.id },
    status: "running",
    phase: "Replacing server data",
    checkpoint: "replacement-planned",
    startedAt: f.clock.now().toISOString(),
    finishedAt: null,
    error: null,
    cleanupComplete: false,
    recoverOnReconnect: false,
    historyOnly: false,
  });
  const saved =
    version === 2
      ? state
      : {
          ...state,
          schemaVersion: 1,
          migrated: true,
          legacySources: [],
          operations: state.operations.map((op) => ({
            ...op,
            ...(op.request as Record<string, unknown>),
            ...(op.data as Record<string, unknown>),
            ...op.result,
            backupId: op.result.backupId ?? null,
            safetyBackupId: op.result.safetyBackupId ?? null,
            taskVersion: version,
          })),
        };
  await atomicJson(path, saved);
  for (const name of originalNames) await rename(join(f.data, name), join(previous, name));
  for (const name of stagedNames.slice(0, Math.ceil(stagedNames.length / 2)))
    await rename(join(staged, name), join(f.data, name));
  await f.runtime.start();
  await new Promise((r) => setTimeout(r, 250));
  const starts = f.runtime.upstreamStarts;
  const next = await reopen(f);
  expect(await readFile(join(f.data, "world/level.dat"), "utf8")).toBe("pre-task B");
  expect(f.runtime.javaRunning).toBe(true);
  expect(f.runtime.upstreamStarts).toBe(starts + 1);
  expect(next.controller.maintenance.operation(operation).status).toBe("failed");
  expect((await next.controller.backups.list()).backups.map((b) => b.id)).toEqual(
    expect.arrayContaining([id, safety.id]),
  );
  expect(JSON.parse(await readFile(path, "utf8")).schemaVersion).toBe(2);
});
it("blocks unknown task versions and a fresh container boot", async () => {
  const f = await fixture();
  await backup(f.controller);
  await f.controller.close();
  await f.runtime.stop();
  const path = join(f.root, "backup-state/state.json"),
    state = JSON.parse(await readFile(path, "utf8"));
  state.operations.at(-1).taskVersion = 99;
  await atomicJson(path, state);
  await f.runtime.start();
  await expect(reopen(f)).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
  await new Promise((r) => setTimeout(r, 250));
  expect(f.runtime.javaRunning).toBe(false);
  expect(JSON.parse(await readFile(path, "utf8")).operations.at(-1).taskVersion).toBe(99);
});
it.each(["missing", "corrupt"])(
  "holds initialized %s state without changing live files",
  async (damage) => {
    const f = await fixture();
    await f.controller.close();
    await f.runtime.stop();
    const path = join(f.root, "backup-state/state.json");
    if (damage === "missing") await rm(path);
    else await writeFile(path, "corrupt");
    await f.runtime.start();
    await expect(reopen(f)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 250));
    expect(f.runtime.javaRunning).toBe(false);
    expect(await readFile(join(f.data, "world/level.dat"), "utf8")).toBe("original world");
  },
);
it("reads completed migration history without retaining a migration executor", async () => {
  const f = await fixture();
  await f.controller.close();
  const path = join(f.root, "backup-state/state.json"),
    state = JSON.parse(await readFile(path, "utf8")),
    id = randomUUID();
  state.schemaVersion = 1;
  state.operations = [
    {
      id,
      kind: "migration",
      status: "succeeded",
      phase: "Complete",
      startedAt: f.clock.now().toISOString(),
      finishedAt: f.clock.now().toISOString(),
      backupId: null,
      safetyBackupId: null,
      error: null,
      taskVersion: 1,
      cleanupComplete: true,
    },
  ];
  await atomicJson(path, state);
  const before = f.runtime.calls.length,
    next = await reopen(f);
  expect(next.controller.maintenance.operation(id).status).toBe("succeeded");
  expect(f.runtime.calls.length).toBe(before);
});
it("holds an unfinished retired migration for explicit upgrade inspection", async () => {
  const f = await fixture();
  await f.controller.close();
  const path = join(f.root, "backup-state/state.json"),
    state = JSON.parse(await readFile(path, "utf8"));
  state.schemaVersion = 1;
  state.operations = [
    {
      id: randomUUID(),
      kind: "migration",
      status: "running",
      phase: "Importing",
      startedAt: f.clock.now().toISOString(),
      finishedAt: null,
      backupId: null,
      safetyBackupId: null,
      error: null,
      taskVersion: 1,
      cleanupComplete: false,
    },
  ];
  await atomicJson(path, state);
  await expect(reopen(f)).rejects.toThrow("previous release");
});
it("authorizes a new normal boot after a clean controller restart", async () => {
  const f = await fixture();
  await f.controller.close();
  await f.runtime.stop();
  await f.runtime.start();
  await new Promise((r) => setTimeout(r, 250));
  expect(f.runtime.javaRunning).toBe(false);
  const next = await reopen(f);
  await vi.waitFor(() => expect(f.runtime.javaRunning).toBe(true));
  expect(next.controller.maintenance.activeOperation()).toBeNull();
});
it.each(["missing completion time", "unsafe completed data", "missing safety proof"])(
  "blocks a well-formed journal with %s",
  async (damage) => {
    const f = await fixture(),
      id = await backup(f.controller);
    await finish(f.controller, await f.controller.backups.restore(id, randomUUID()));
    await f.controller.close();
    await f.runtime.stop();
    const path = join(f.root, "backup-state/state.json"),
      state = JSON.parse(await readFile(path, "utf8")),
      op = state.operations.at(-1);
    if (damage === "missing completion time") op.finishedAt = null;
    else if (damage === "unsafe completed data") op.data.liveDataSafe = false;
    else op.data.safetyVerified = false;
    await atomicJson(path, state);
    await f.runtime.start();
    await expect(reopen(f)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 250));
    expect(f.runtime.javaRunning).toBe(false);
    expect(await readFile(join(f.data, "world/level.dat"), "utf8")).toBe("original world");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(state);
  },
);
