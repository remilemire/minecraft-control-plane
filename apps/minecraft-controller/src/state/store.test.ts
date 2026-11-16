import { journalSchema } from "@/tasks/operations.js";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ControllerStore } from "./store.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "maintenance-store-"));
  roots.push(root);
  return { root, store: new ControllerStore(join(root, "backup-state")) };
}
it("initializes an empty store only for a new installation", async () => {
  const { store } = await fixture();
  expect((await store.load("UTC")).operations).toEqual([]);
});
it.each([
  "backup-state/initialized",
  "backup-recovery/task/previous/world",
  "backups/archive/manifest.json",
  "backup-state/state.json.unfinished.tmp",
])("holds a missing journal with prior state: %s", async (name) => {
  const { root, store } = await fixture();
  const path = join(root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "prior state");
  await expect(store.load("UTC")).rejects.toThrow("missing");
});
it("rejects corrupt state rather than replacing it", async () => {
  const { root, store } = await fixture();
  await mkdir(store.root);
  await writeFile(join(root, "backup-state/state.json"), "broken");
  await expect(store.load("UTC")).rejects.toThrow();
});
it("loads legacy operation metadata without changing public identifiers", () => {
  const operation = journalSchema.parse({
    id: "09bf8563-2114-4af0-a4c7-215e30a7d2b9",
    kind: "restore",
    status: "running",
    phase: "Replacing server data",
    startedAt: "2026-11-15T00:00:00Z",
    finishedAt: null,
    backupId: null,
    safetyBackupId: null,
    error: null,
  });
  expect(operation.taskVersion).toBe(0);
  expect(operation.checkpoint).toBeNull();
  expect(operation.recoverOnReconnect).toBe(false);
});
it("rejects restore checkpoints on power tasks while accepting old default metadata", () => {
  const original = {
    id: "09bf8563-2114-4af0-a4c7-215e30a7d2b9",
    kind: "start",
    status: "running",
    phase: "Preparing",
    startedAt: "2026-11-15T00:00:00Z",
    finishedAt: null,
    backupId: null,
    safetyBackupId: null,
    error: null,
  };
  expect(journalSchema.safeParse({ ...original, replacementStarted: true }).success).toBe(false);
  expect(
    journalSchema.safeParse({
      ...original,
      replacementStarted: false,
      replacementComplete: false,
      originalNames: [],
      stagedNames: [],
    }).success,
  ).toBe(true);
  expect(
    journalSchema.parse({
      ...original,
      kind: "restore",
      replacementStarted: true,
      originalNames: ["world"],
    }).kind,
  ).toBe("restore");
});
