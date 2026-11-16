import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
  chmod,
  lstat,
  appendFile,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import tar from "tar-stream";
import { afterEach, expect, it } from "vitest";
import { safeArchivePath } from "@/data/policy.js";
import { atomicJson } from "@/filesystem/atomic-files.js";
import { ArchiveStorage, sha256File } from "./archive.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "native-archive-"));
  roots.push(root);
  const data = join(root, "minecraft"),
    storage = new ArchiveStorage(join(root, "backups"));
  await mkdir(join(data, "world"), { recursive: true });
  await writeFile(join(data, "world/level.dat"), "world");
  return { root, data, storage };
}
function metadata(origin: "manual" | "safety" = "manual") {
  return {
    id: randomUUID(),
    createdAt: "2026-09-10T18:30:00Z",
    origin,
    contents: "full" as const,
    method: "offline" as const,
    tiers: [],
    version: null,
    worldName: "world",
  };
}
it("creates, verifies and stages native archives with executable permissions", async () => {
  const f = await fixture();
  await writeFile(join(f.data, "run.sh"), "#!/bin/sh\n");
  await chmod(join(f.data, "run.sh"), 0o755);
  const record = await f.storage.create(f.data, metadata());
  const stage = join(f.root, "stage");
  await mkdir(stage);
  await f.storage.verify(record.id, stage);
  expect(await readFile(join(stage, "world/level.dat"), "utf8")).toBe("world");
  expect((await lstat(join(stage, "run.sh"))).mode & 0o777).toBe(0o755);
  expect((await lstat(join(stage, "run.sh"))).uid).toBe((await lstat(join(f.data, "run.sh"))).uid);
});
it.each(["../world", "/etc/passwd", "a/../../b", "a\\b", "C:/file", "a//b", "a/./b", "a\0b"])(
  "rejects unsafe archive path %s",
  (name) => {
    expect(() => safeArchivePath(name)).toThrow();
  },
);
it("rejects symlinks and invalid archive identities", async () => {
  const f = await fixture();
  await symlink("/etc/passwd", join(f.data, "escape"));
  await expect(f.storage.create(f.data, metadata())).rejects.toMatchObject({
    code: "BACKUP_INVALID",
  });
  expect(() => f.storage.directory("../outside")).toThrow();
});
it("excludes runtime logs and nested backups", async () => {
  const f = await fixture();
  for (const dir of ["logs", "backups", "ftbbackups3"]) {
    await mkdir(join(f.data, dir));
    await writeFile(join(f.data, dir, "ignored"), "ignored");
  }
  const record = await f.storage.create(f.data, metadata()),
    manifest = await f.storage.manifest(record.id);
  expect(manifest.entries.some((e) => /^(logs|backups|ftbbackups3)(\/|$)/.test(e.path))).toBe(
    false,
  );
});
it("allows a damaged world in a safety snapshot while rejecting it as a normal backup", async () => {
  const f = await fixture();
  await rm(join(f.data, "world/level.dat"));
  await expect(f.storage.create(f.data, metadata())).rejects.toMatchObject({
    code: "BACKUP_INVALID",
  });
  const safety = await f.storage.create(f.data, metadata("safety"));
  expect(
    (await f.storage.verify(safety.id)).entries.some((e) => e.path === "world/level.dat"),
  ).toBe(false);
});
it("rejects checksum damage and a malicious archive with an updated outer checksum", async () => {
  const f = await fixture(),
    record = await f.storage.create(f.data, metadata()),
    file = join(f.storage.directory(record.id), "archive.tar.gz");
  await writeFile(file, "damage");
  await expect(f.storage.verify(record.id)).rejects.toMatchObject({ code: "BACKUP_INVALID" });
  const pack = tar.pack(),
    output = pipeline(pack, createGzip(), createWriteStream(file));
  pack.entry({ name: "../escaped", size: 1 }, "x");
  pack.finalize();
  await output;
  const manifest = await f.storage.manifest(record.id);
  manifest.backup.sha256 = await sha256File(file);
  await atomicJson(join(f.storage.directory(record.id), "manifest.json"), manifest);
  const stage = join(f.root, "stage");
  await mkdir(stage);
  await expect(f.storage.verify(record.id, stage)).rejects.toMatchObject({
    code: "BACKUP_INVALID",
  });
  await expect(readFile(join(f.root, "escaped"))).rejects.toMatchObject({ code: "ENOENT" });
});
it("detects changing source files instead of publishing a successful backup", async () => {
  const f = await fixture(),
    info = metadata(),
    file = join(f.data, "world/growing.dat");
  await writeFile(file, Buffer.alloc(4 * 1024 * 1024));
  const writes: Promise<void>[] = [];
  const timer = setInterval(() => writes.push(appendFile(file, "change")), 2);
  try {
    await expect(f.storage.create(f.data, info)).rejects.toThrow();
    await expect(stat(f.storage.directory(info.id))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    clearInterval(timer);
    await Promise.all(writes);
  }
});
it("verifies recovered live data against its safety manifest", async () => {
  const f = await fixture(),
    record = await f.storage.create(f.data, metadata("safety"));
  await f.storage.verifySource(record.id, f.data);
  await writeFile(join(f.data, "world/level.dat"), "changed");
  await expect(f.storage.verifySource(record.id, f.data)).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
});
