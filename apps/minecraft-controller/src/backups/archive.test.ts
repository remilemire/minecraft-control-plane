import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendFile,
  chmod,
  lstat,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import tar from "tar-stream";
import { safeArchivePath, sha256File } from "./archive.js";
import { fixture, finish, takeBackup } from "./test-fixtures.js";
import { atomicJson } from "./store.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
describe("archive safety", () => {
  it("can restore over a damaged world while keeping its damaged state in the safety backup", async () => {
    const { manager, root, data, runtime } = await fixture();
    roots.push(root);
    const id = await takeBackup(manager);
    runtime.state.running = false;
    await rm(join(data, "world/level.dat"));
    const restored = await finish(manager, await manager.restore(id, randomUUID()));
    expect(restored.status).toBe("succeeded");
    expect(await readFile(join(data, "world/level.dat"), "utf8")).toBe("original world data");
    const safety = await manager.storage.manifest(restored.safetyBackupId!);
    expect(safety.entries.some((entry) => entry.path === "world/level.dat")).toBe(false);
    expect(runtime.state.running).toBe(false);
  });
  it.each(["../world", "/etc/passwd", "a/../../b", "a\\b", "C:/file", "a//b", "a/./b", "a\0b"])(
    "rejects unsafe entry %s",
    (entry) => {
      expect(() => safeArchivePath(entry)).toThrow();
    },
  );
  it("excludes logs and old backups and preserves executable permissions", async () => {
    const { manager, root, data } = await fixture();
    roots.push(root);
    await mkdir(join(data, "logs"));
    await writeFile(join(data, "logs/latest.log"), "log noise");
    await mkdir(join(data, "ftbbackups3"));
    await writeFile(join(data, "ftbbackups3/old.zip"), "not nested");
    await writeFile(join(data, "run.sh"), "#!/bin/sh\n");
    await chmod(join(data, "run.sh"), 0o755);
    const id = await takeBackup(manager);
    const manifest = await manager.storage.manifest(id);
    expect(
      manifest.entries.some((e) => e.path.startsWith("logs") || e.path.startsWith("ftbbackups3")),
    ).toBe(false);
    const stage = join(root, "staging");
    await mkdir(stage);
    await manager.storage.verify(id, stage);
    expect((await lstat(join(stage, "run.sh"))).mode & 0o777).toBe(0o755);
    expect((await lstat(join(stage, "run.sh"))).uid).toBe((await lstat(join(data, "run.sh"))).uid);
  });
  it("refuses symlinks instead of following them outside the snapshot", async () => {
    const { manager, root, data } = await fixture();
    roots.push(root);
    await symlink("/etc/passwd", join(data, "escape"));
    expect((await finish(manager, await manager.create(randomUUID()))).status).toBe("failed");
    expect((await manager.list()).backups).toHaveLength(0);
  });
  it("detects live file changes and re-enables saving", async () => {
    const { manager, root, data, runtime } = await fixture();
    roots.push(root);
    runtime.players = 1;
    const path = join(data, "world/growing.dat");
    await writeFile(path, Buffer.alloc(4 * 1024 * 1024));
    const writes: Promise<void>[] = [];
    const timer = setInterval(() => {
      writes.push(appendFile(path, "changing"));
    }, 2);
    try {
      expect((await finish(manager, await manager.create(randomUUID()))).status).toBe("failed");
      expect((await manager.list()).backups).toHaveLength(0);
      expect(runtime.commands.at(-1)).toBe("save-on");
    } finally {
      clearInterval(timer);
      await Promise.all(writes);
    }
  });
  it("rejects a traversal archive even if its outer checksum was changed to match", async () => {
    const { manager, root } = await fixture();
    roots.push(root);
    const id = await takeBackup(manager);
    const file = join(manager.storage.directory(id), "archive.tar.gz");
    const pack = tar.pack();
    const output = pipeline(pack, createGzip(), createWriteStream(file));
    pack.entry({ name: "../escaped", size: 1 }, "x");
    pack.finalize();
    await output;
    const manifest = await manager.storage.manifest(id);
    manifest.backup.sha256 = await sha256File(file);
    await atomicJson(join(manager.storage.directory(id), "manifest.json"), manifest);
    const stage = join(root, "staging");
    await mkdir(stage);
    await expect(manager.storage.verify(id, stage)).rejects.toMatchObject({
      code: "BACKUP_INVALID",
    });
    await expect(readFile(join(root, "escaped"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
