import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BackupManager } from "./manager.js";
import { fixture, finish, storedZip } from "./test-fixtures.js";
import { atomicJson } from "./store.js";
import { readLegacyZip } from "./archive.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("legacy FTB migration", () => {
  it("preserves originals, disables both FTB schedules, and survives an interrupted catalogue write", async () => {
    const { manager, root, data, runtime, options } = await fixture();
    roots.push(root);
    await mkdir(join(data, "config"));
    const config = "{\n  auto: true\n  force_on_shutdown: true\n  other_setting: 7\n}\n";
    await writeFile(join(data, "config/ftbbackups3-server.snbt"), config);
    await mkdir(join(data, "ftbbackups3"));
    const original = storedZip("world/level.dat", "legacy world");
    const path = join(data, "ftbbackups3/2026-09-10.zip");
    await writeFile(path, original);
    expect(await manager.setupRequired()).toBe(true);
    expect((await finish(manager, await manager.migrate(randomUUID()))).status).toBe("failed");
    runtime.state.running = false;
    expect((await finish(manager, await manager.migrate(randomUUID()))).status).toBe("succeeded");
    expect(await readFile(path)).toEqual(original);
    expect(await readFile(join(data, "world/serverconfig/ftbbackups3-server.snbt"), "utf8")).toBe(
      config
        .replace("auto: true", "auto: false")
        .replace("force_on_shutdown: true", "force_on_shutdown: false"),
    );
    const records = (await manager.list()).backups;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      origin: "legacy",
      contents: "world",
      version: null,
      compatibility: { compatible: false },
    });
    // Simulate commit of the archive followed by loss of its catalogue update.
    const statePath = join(root, "backup-state/state.json");
    const state = JSON.parse(await readFile(statePath, "utf8")) as Record<string, unknown>;
    state.backups = [];
    state.legacySources = [];
    state.migrated = false;
    await atomicJson(statePath, state);
    const restarted = new BackupManager(options);
    await restarted.initialize();
    expect((await finish(restarted, await restarted.migrate(randomUUID()))).status).toBe(
      "succeeded",
    );
    expect((await restarted.list()).backups).toHaveLength(1);
    expect(await restarted.setupRequired()).toBe(false);
  });
  it.each(["../escape", "/absolute", "world/../escape"])(
    "rejects ZIP extraction path %s",
    async (name) => {
      const { root } = await fixture();
      roots.push(root);
      const path = join(root, "invalid.zip");
      await writeFile(path, storedZip(name, "bad"));
      await expect(readLegacyZip(path)).rejects.toThrow();
    },
  );
  it("rejects corrupt legacy contents", async () => {
    const { root } = await fixture();
    roots.push(root);
    const path = join(root, "corrupt.zip");
    const archive = storedZip("world/level.dat", "legacy world");
    archive[30 + "world/level.dat".length] = 0;
    await writeFile(path, archive);
    await expect(readLegacyZip(path)).rejects.toThrow();
  });
});
