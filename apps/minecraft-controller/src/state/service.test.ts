import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { StateService } from "./service.js";
import { z } from "zod";
import { defineTask } from "@/maintenance/service.js";
import { validateTaskRecord } from "@/maintenance/service.js";
import type { BackupRecord } from "@minecraft-control-plane/shared/minecraft";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "aggregate-test-"));
  roots.push(root);
  const state = new StateService(join(root, "backup-state"), "UTC", (record) =>
    validateTaskRecord(
      new Map([
        [
          "synthetic",
          defineTask({
            kind: "synthetic",
            version: 2,
            request: z.object({}),
            state: z.object({}),
            initial: () => ({}),
            canBoot: () => true,
            apply: async () => {},
            recover: async () => {},
          }),
        ],
      ]),
      record,
    ),
  );
  return { root, state };
}
function record(): BackupRecord {
  return {
    id: randomUUID(),
    createdAt: "2026-09-10T18:30:00Z",
    origin: "manual",
    contents: "full",
    format: "tar.gz",
    method: "offline",
    tiers: [],
    sizeBytes: 1,
    expandedBytes: 1,
    fileCount: 1,
    sha256: "0".repeat(64),
    version: null,
    worldName: "world",
  };
}
it("publishes detached frozen views and never exposes the mutable aggregate", async () => {
  const f = await fixture();
  await f.state.initialize();
  const view = f.state.schedules().read();
  expect(Reflect.set(view.enabled, "daily", true)).toBe(false);
  expect(f.state.schedules().read().enabled.daily).toBe(false);
  const catalogue = f.state.catalogue(),
    entry = record();
  await catalogue.commit([catalogue.put(entry)]);
  entry.worldName = "modified caller";
  expect(catalogue.list()[0]?.worldName).toBe("world");
  expect(Reflect.set(catalogue.list()[0]!, "worldName", "modified view")).toBe(false);
});
it("applies concurrent commits to the latest state without lost updates", async () => {
  const f = await fixture();
  await f.state.initialize();
  const catalogue = f.state.catalogue(),
    a = record(),
    b = record();
  await Promise.all([catalogue.commit([catalogue.put(a)]), catalogue.commit([catalogue.put(b)])]);
  expect(
    catalogue
      .list()
      .map((r) => r.id)
      .sort(),
  ).toEqual([a.id, b.id].sort());
});
it("discards an uncommitted draft and poisons further writes after real filesystem failure", async () => {
  const f = await fixture();
  await f.state.initialize();
  const file = join(f.root, "backup-state/state.json"),
    saved = join(f.root, "saved.json");
  await rename(file, saved);
  await mkdir(file);
  const schedules = f.state.schedules(),
    old = schedules.read();
  await expect(
    schedules.commit([
      schedules.configure({
        enabled: { ...old.enabled, daily: true },
        nextRuns: { ...old.nextRuns },
        timezone: old.timezone,
      }),
    ]),
  ).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
  expect(schedules.read().enabled.daily).toBe(false);
  expect(f.state.journal().healthy()).toBe(false);
  await expect(f.state.catalogue().commit([])).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  await rm(file, { recursive: true });
  await rename(saved, file);
  await f.state.reopen();
  expect(f.state.journal().healthy()).toBe(true);
  expect(schedules.read().enabled.daily).toBe(false);
});
it("rejects foreign commit participants without poisoning known-good storage", async () => {
  const a = await fixture(),
    b = await fixture();
  await a.state.initialize();
  await b.state.initialize();
  await expect(a.state.catalogue().commit([b.state.catalogue().put(record())])).rejects.toThrow(
    "another state store",
  );
  expect(a.state.journal().healthy()).toBe(true);
});
it.each([
  "backup-state/initialized",
  "backup-recovery/task/previous/world",
  "backups/snapshot/manifest.json",
  "backup-state/state.json.pending.tmp",
])("blocks a missing journal with prior state: %s", async (name) => {
  const f = await fixture(),
    path = join(f.root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "prior state");
  await expect(f.state.initialize()).rejects.toThrow("missing");
});
it("rejects corrupt state instead of reinitializing it", async () => {
  const f = await fixture();
  await mkdir(join(f.root, "backup-state"));
  await writeFile(join(f.root, "backup-state/state.json"), "corrupt");
  await expect(f.state.initialize()).rejects.toThrow();
});
it("commits catalogue effects with admission in one durable aggregate", async () => {
  const f = await fixture();
  await f.state.initialize();
  const entry = record(),
    id = randomUUID();
  const operation = {
    id,
    kind: "synthetic",
    taskVersion: 2,
    request: {},
    data: {},
    result: {},
    status: "running" as const,
    phase: "Preparing",
    checkpoint: "admitted",
    startedAt: "2026-09-10T18:30:00Z",
    finishedAt: null,
    error: null,
    cleanupComplete: false,
    recoverOnReconnect: false,
    historyOnly: false,
  };
  const file = join(f.root, "backup-state/state.json"),
    saved = join(f.root, "saved.json");
  await rename(file, saved);
  await mkdir(file);
  await expect(
    f.state.journal().admit(operation, [f.state.catalogue().put(entry)]),
  ).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
  expect(f.state.journal().all()).toEqual([]);
  expect(f.state.catalogue().list()).toEqual([]);
  await rm(file, { recursive: true });
  await rename(saved, file);
  await f.state.reopen();
  await f.state.journal().admit(operation, [f.state.catalogue().put(entry)]);
  const committed = JSON.parse(await readFile(file, "utf8"));
  expect(committed.operations[0].id).toBe(id);
  expect(committed.backups[0].id).toBe(entry.id);
});
