import { constants } from "node:fs";
import {
  chmod,
  chown,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { join, sep } from "node:path";
import { createHash } from "node:crypto";
import type { BackupRecord } from "@minecraft-control-plane/shared/minecraft";
import { ArchiveStorage, readLegacyZip, sha256File } from "./archive.js";
import { BackupError, isMissing } from "./errors.js";
import { atomicJson, atomicText, syncDirectory, type BackupState } from "./store.js";

export async function ftbConfigExists(dataPath: string): Promise<boolean> {
  try {
    await lstat(join(dataPath, "config/ftbbackups3-server.snbt"));
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function disableFtbScheduling(dataPath: string, worldName: string): Promise<void> {
  if (!(await ftbConfigExists(dataPath))) return;
  const directory = join(dataPath, worldName, "serverconfig");
  await mkdir(directory, { recursive: true });
  if (!(await realpath(directory)).startsWith(`${await realpath(dataPath)}${sep}`))
    throw new BackupError(
      "BACKUP_INVALID",
      "The FTB configuration directory must remain inside Minecraft data.",
    );
  const path = join(directory, "ftbbackups3-server.snbt");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
    text = await readFile(join(dataPath, "config/ftbbackups3-server.snbt"), "utf8");
  }
  for (const key of ["auto", "force_on_shutdown"]) {
    const pattern = new RegExp(`^([ \\t]*)${key}:[ \\t]*(?:true|false)(,?)[ \\t]*$`, "m");
    if (!pattern.test(text))
      throw new BackupError(
        "BACKUP_SETUP_REQUIRED",
        "The FTB backup configuration format is unsupported. Set auto and force_on_shutdown to false in the world's serverconfig file before retrying migration.",
      );
    text = text.replace(pattern, `$1${key}: false$2`);
  }
  await atomicText(path, text);
  const owner = await lstat(directory);
  await chown(path, owner.uid, owner.gid);
  await chmod(path, 0o644);
}

export async function importLegacy(
  dataPath: string,
  storage: ArchiveStorage,
  state: BackupState,
  save: () => Promise<void>,
): Promise<void> {
  const directory = join(dataPath, "ftbbackups3");
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const name of files.sort()) {
    if (!/^[\w.-]+\.zip$/.test(name)) continue;
    const path = join(directory, name);
    if (!(await lstat(path)).isFile())
      throw new BackupError("BACKUP_INVALID", "Legacy backup archives must be regular files.");
    const checksum = await sha256File(path);
    const sourceId = `${name}:${checksum}`;
    if (state.legacySources.includes(sourceId)) continue;
    // Stable per source: a crash between archive commit and catalogue save must
    // not import a second copy when the migration is retried.
    const digest = createHash("sha256").update(sourceId).digest("hex");
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    if (state.backups.some((backup) => backup.id === id)) {
      state.legacySources.push(sourceId);
      await save();
      continue;
    }
    const temporary = join(storage.root, `.partial-${id}`);
    await mkdir(temporary, { recursive: true, mode: 0o700 });
    try {
      const target = join(temporary, "archive.zip");
      await copyFile(path, target, constants.COPYFILE_EXCL);
      if ((await sha256File(target)) !== checksum || (await sha256File(path)) !== checksum)
        throw new BackupError("BACKUP_INVALID", "A legacy archive changed during import.");
      const { entries, worldName } = await readLegacyZip(target);
      const stat = await lstat(path);
      const backup: BackupRecord = {
        id,
        createdAt: stat.mtime.toISOString(),
        origin: "legacy",
        contents: "world",
        format: "zip",
        method: "legacy",
        tiers: [],
        sizeBytes: Number(stat.size),
        expandedBytes: entries.reduce((sum, e) => sum + e.size, 0),
        fileCount: entries.filter((e) => e.type === "file").length,
        sha256: checksum,
        version: null,
        worldName,
      };
      await atomicJson(join(temporary, "manifest.json"), { schemaVersion: 1, backup, entries });
      await rename(temporary, storage.directory(id));
      await syncDirectory(storage.root);
      state.backups.push(backup);
      state.legacySources.push(sourceId);
      await save();
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }
}
