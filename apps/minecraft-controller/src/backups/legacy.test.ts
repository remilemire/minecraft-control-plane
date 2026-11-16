import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createController } from "@/composition.js";
import { ControllerStore } from "@/state/store.js";
import { journalSchema } from "@/tasks/operations.js";
import { fixture, storedZip, takeBackup } from "./test-fixtures.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it("does not import FTB archives or gate panel backups on retired setup", async () => {
  const { controller, root, data } = await fixture();
  roots.push(root);
  await mkdir(join(data, "config"));
  await writeFile(join(data, "config/ftbbackups3-server.snbt"), "old config");
  await mkdir(join(data, "ftbbackups3"));
  const path = join(data, "ftbbackups3/old.zip"),
    original = storedZip("world/level.dat", "legacy");
  await writeFile(path, original);
  expect((await controller.backups.list()).setupRequired).toBe(false);
  await takeBackup(controller.backups, controller.maintenance);
  expect((await controller.backups.list()).backups).toHaveLength(1);
  expect(await readFile(path)).toEqual(original);
});
it("recovers an old migration journal without replaying its import", async () => {
  const { options, root, runtime } = await fixture();
  roots.push(root);
  const store = new ControllerStore(join(root, "backup-state"));
  const state = await store.load(options.timezone);
  const id = randomUUID();
  state.operations.push(
    journalSchema.parse({
      id,
      kind: "migration",
      taskVersion: 0,
      status: "running",
      phase: "Importing existing FTB backups",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      backupId: null,
      safetyBackupId: null,
      error: null,
      containerId: runtime.state.containerId,
    }),
  );
  await store.save(state);
  const controller = createController(options);
  await controller.initialize();
  expect(controller.maintenance.operation(id).status).toBe("failed");
  expect(controller.maintenance.activeOperation()).toBeNull();
  expect((await controller.backups.list()).backups).toHaveLength(0);
});
it("hides retired ZIP records without deleting their bytes or journal metadata", async () => {
  const { controller, root, options } = await fixture();
  roots.push(root);
  const id = await takeBackup(controller.backups, controller.maintenance);
  const source = await controller.backups.storage.manifest(id);
  const zipId = randomUUID();
  const bytes = storedZip("world/level.dat", "legacy");
  const record = {
    ...source.backup,
    id: zipId,
    origin: "legacy" as const,
    contents: "world" as const,
    format: "zip" as const,
    version: null,
  };
  const directory = controller.backups.storage.directory(zipId);
  await mkdir(directory);
  await writeFile(join(directory, "archive.zip"), bytes);
  await writeFile(join(directory, "manifest.json"), JSON.stringify({ ...source, backup: record }));
  const store = new ControllerStore(join(root, "backup-state")),
    state = await store.load(options.timezone);
  state.backups.push(record);
  await store.save(state);
  const restarted = createController(options);
  await restarted.initialize();
  expect((await restarted.backups.list()).backups.map((b) => b.id)).toEqual([id]);
  expect((await restarted.backups.preview(zipId)).canRestore).toBe(false);
  await expect(restarted.backups.storage.verify(zipId)).rejects.toMatchObject({
    code: "BACKUP_INCOMPATIBLE",
  });
  expect(await readFile(join(directory, "archive.zip"))).toEqual(bytes);
  expect((await store.load(options.timezone)).backups.some((b) => b.id === zipId)).toBe(true);
});
