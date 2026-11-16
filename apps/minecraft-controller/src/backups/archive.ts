import { backupRecordSchema, type BackupRecord } from "@minecraft-control-plane/shared/minecraft";
import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  chown,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  statfs,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import tar from "tar-stream";
import { z } from "zod";
import { ControllerError } from "@/errors.js";
import { atomicJson, syncDirectory } from "@/state/atomic-files.js";
import { excluded, safeArchivePath } from "@/runtime/data-policy.js";

const entrySchema = z.object({
  path: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative(),
  mode: z.number().int().min(0).max(0o777),
  uid: z.number().int().nonnegative(),
  gid: z.number().int().nonnegative(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
export type ArchiveEntry = z.infer<typeof entrySchema>;
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  backup: backupRecordSchema,
  entries: z.array(entrySchema),
});
export type ArchiveManifest = z.infer<typeof manifestSchema>;

export async function availableSpace(path: string): Promise<number> {
  const fs = await statfs(path);
  return fs.bavail * fs.bsize;
}
export async function requireSpace(path: string, bytes: number): Promise<void> {
  if ((await availableSpace(path)) < bytes)
    throw new ControllerError(
      "BACKUP_STORAGE_FULL",
      "There is not enough space for the archive, staging files, and safety backup.",
    );
}

interface SourceEntry extends ArchiveEntry {
  fingerprint: string;
}
function fingerprint(stat: Awaited<ReturnType<typeof lstat>>): string {
  return `${String(stat.dev)}:${String(stat.ino)}:${String(stat.size)}:${String(stat.mtimeMs)}:${String(stat.ctimeMs)}`;
}

async function inventory(root: string): Promise<SourceEntry[]> {
  const entries: SourceEntry[] = [];
  async function walk(relative: string) {
    for (const name of (await readdir(join(root, relative))).sort()) {
      const path = relative ? `${relative}/${name}` : name;
      if (excluded(path)) continue;
      safeArchivePath(path);
      const stat = await lstat(join(root, path));
      if (!stat.isDirectory() && !stat.isFile())
        throw new ControllerError(
          "BACKUP_INVALID",
          "Backups support regular files and directories only; remove unsupported links or special files first.",
        );
      entries.push({
        path,
        type: stat.isDirectory() ? "directory" : "file",
        size: stat.isDirectory() ? 0 : Number(stat.size),
        mode: Number(stat.mode) & 0o777,
        uid: Number(stat.uid),
        gid: Number(stat.gid),
        sha256: null,
        fingerprint: fingerprint(stat),
      });
      if (stat.isDirectory()) await walk(path);
    }
  }
  await walk("");
  return entries;
}

export async function sourceSize(root: string): Promise<number> {
  return (await inventory(root)).reduce((total, e) => total + e.size, 0);
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export class ArchiveStorage {
  public constructor(
    public readonly root: string,
    private readonly observe?: (event: string) => Promise<void>,
  ) {}
  public directory(id: string): string {
    return join(this.root, id);
  }
  public async manifest(id: string): Promise<ArchiveManifest> {
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(join(this.directory(id), "manifest.json"), "utf8")),
    );
    if (
      manifest.entries.reduce((sum, e) => sum + e.size, 0) !== manifest.backup.expandedBytes ||
      manifest.entries.filter((e) => e.type === "file").length !== manifest.backup.fileCount
    )
      throw new ControllerError(
        "BACKUP_INVALID",
        "The archive size or file count does not match its manifest.",
      );
    return manifest;
  }
  public async remove(id: string): Promise<void> {
    await rm(this.directory(id), { recursive: true, force: true });
    await syncDirectory(this.root);
  }

  public async create(
    source: string,
    metadata: Omit<BackupRecord, "sha256" | "sizeBytes" | "expandedBytes" | "fileCount" | "format">,
  ): Promise<BackupRecord> {
    const sourceEntries = await inventory(source);
    const expandedBytes = sourceEntries.reduce((sum, e) => sum + e.size, 0);
    if (
      metadata.origin !== "safety" &&
      !sourceEntries.some((e) => e.path === `${metadata.worldName}/level.dat` && e.size > 0)
    )
      throw new ControllerError(
        "BACKUP_INVALID",
        "The configured world's level.dat is missing or empty.",
      );
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await requireSpace(this.root, Math.ceil(expandedBytes * 1.1) + 64 * 1024 * 1024);
    const temporary = join(this.root, `.partial-${metadata.id}`);
    await mkdir(temporary, { mode: 0o700 });
    const archivePath = join(temporary, "archive.tar.gz");
    const pack = tar.pack();
    const output = pipeline(
      pack,
      createGzip(),
      createWriteStream(archivePath, { flags: "wx", mode: 0o600 }),
    );
    // Attach immediately: disk errors can arrive while the producer is still reading a file.
    void output.catch(() => undefined);
    const entries: ArchiveEntry[] = [];
    try {
      for (const item of sourceEntries) {
        if (fingerprint(await lstat(join(source, item.path))) !== item.fingerprint)
          throw new ControllerError(
            "BACKUP_INVALID",
            "Files changed while the backup was being read. Retry when the server is empty.",
          );
        const entry = pack.entry({
          name: item.path,
          type: item.type,
          size: item.size,
          mode: item.mode,
          uid: item.uid,
          gid: item.gid,
        });
        if (item.type === "directory") entry.end(Buffer.alloc(0));
        else {
          const hash = createHash("sha256");
          const hasher = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              hash.update(chunk);
              callback(null, chunk);
            },
          });
          const sourceFile = await open(
            join(source, item.path),
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          try {
            if (fingerprint(await sourceFile.stat()) !== item.fingerprint)
              throw new ControllerError(
                "BACKUP_INVALID",
                "A source file changed before it could be opened.",
              );
            await pipeline(sourceFile.createReadStream(), hasher, entry);
          } finally {
            await sourceFile.close();
          }
          item.sha256 = hash.digest("hex");
        }
        entries.push(entrySchema.parse(item));
        await this.observe?.(`archive-entry:${item.path}`);
      }
      pack.finalize();
      await output;
      const after = await inventory(source);
      if (
        after.length !== sourceEntries.length ||
        after.some(
          (e, i) =>
            e.path !== sourceEntries[i]?.path || e.fingerprint !== sourceEntries[i]?.fingerprint,
        )
      )
        throw new ControllerError(
          "BACKUP_INVALID",
          "Files changed during the backup. No successful backup was created; retry when the server is empty.",
        );
      const backup: BackupRecord = {
        ...metadata,
        format: "tar.gz",
        sha256: await sha256File(archivePath),
        sizeBytes: Number((await lstat(archivePath)).size),
        expandedBytes,
        fileCount: entries.filter((e) => e.type === "file").length,
      };
      const manifest: ArchiveManifest = { schemaVersion: 1, backup, entries };
      await this.readTar(archivePath, manifest);
      const file = await open(archivePath, "r");
      try {
        await file.sync();
      } finally {
        await file.close();
      }
      await atomicJson(join(temporary, "manifest.json"), manifest);
      await rename(temporary, this.directory(metadata.id));
      await syncDirectory(this.root);
      return backup;
    } catch (error) {
      pack.destroy(error instanceof Error ? error : new Error(String(error)));
      await output.catch(() => undefined);
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  public async verify(id: string, destination?: string): Promise<ArchiveManifest> {
    const manifest = await this.manifest(id);
    if (manifest.backup.format !== "tar.gz")
      throw new ControllerError(
        "BACKUP_INCOMPATIBLE",
        "Legacy ZIP archives are no longer supported.",
      );
    if (manifest.backup.id !== id)
      throw new ControllerError(
        "BACKUP_INVALID",
        "The archive identity does not match its record.",
      );
    const path = join(this.directory(id), `archive.${manifest.backup.format}`);
    if ((await sha256File(path)) !== manifest.backup.sha256)
      throw new ControllerError(
        "BACKUP_INVALID",
        "The backup checksum does not match. The archive may be damaged.",
      );
    await this.readTar(path, manifest, destination);
    return manifest;
  }

  private async readTar(
    path: string,
    manifest: ArchiveManifest,
    destination?: string,
  ): Promise<void> {
    const expected = new Map(manifest.entries.map((e) => [e.path, e]));
    if (expected.size !== manifest.entries.length)
      throw new ControllerError("BACKUP_INVALID", "Duplicate archive paths.");
    const extract = tar.extract();
    const input = pipeline(createReadStream(path), createGunzip(), extract);
    void input.catch(() => undefined);
    const seen = new Set<string>();
    try {
      for await (const entry of extract) {
        const name = safeArchivePath(entry.header.name);
        const item = expected.get(name);
        if (
          !item ||
          seen.has(name) ||
          item.type !== entry.header.type ||
          item.size !== entry.header.size ||
          excluded(name)
        )
          throw new ControllerError(
            "BACKUP_INVALID",
            "The archive contents do not match the verified file manifest.",
          );
        seen.add(name);
        const target = destination ? join(destination, name) : undefined;
        if (item.type === "directory") {
          if (target) await mkdir(target, { recursive: true, mode: 0o700 });
          entry.resume();
        } else {
          if (target) await mkdir(dirname(target), { recursive: true, mode: 0o700 });
          const hash = createHash("sha256");
          const hasher = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              hash.update(chunk);
              callback(null, chunk);
            },
          });
          const sink = target
            ? createWriteStream(target, { flags: "wx", mode: 0o600 })
            : new Writable({
                write(_chunk, _encoding, callback) {
                  callback();
                },
              });
          await pipeline(entry, hasher, sink);
          if (hash.digest("hex") !== item.sha256)
            throw new ControllerError(
              "BACKUP_INVALID",
              "An archived file failed its checksum check.",
            );
          if (target) {
            await chown(target, item.uid, item.gid);
            await chmod(target, item.mode & 0o777);
            const file = await open(target, "r");
            try {
              await file.sync();
            } finally {
              await file.close();
            }
          }
        }
        if (destination) await this.observe?.(`staged-entry:${name}`);
      }
      await input;
      if (seen.size !== expected.size)
        throw new ControllerError("BACKUP_INVALID", "The archive is missing files.");
      if (destination) {
        for (const item of [...manifest.entries].reverse())
          if (item.type === "directory") {
            await chown(join(destination, item.path), item.uid, item.gid);
            await chmod(join(destination, item.path), item.mode & 0o777);
            await syncDirectory(join(destination, item.path));
          }
        await syncDirectory(destination);
      }
    } catch (error) {
      extract.destroy(error instanceof Error ? error : undefined);
      await input.catch(() => undefined);
      throw error;
    }
  }
}
