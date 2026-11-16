import { open, readFile, chmod, chown, lstat, mkdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { ControllerError, isMissing } from "@/errors.js";
import { atomicText } from "@/filesystem/atomic-files.js";

// Restore gameplay settings while retaining current connection credentials and
// panel access enforcement. Other deployment settings remain in Docker's env.
const CURRENT_PROPERTIES = new Set([
  "rcon.password",
  "rcon.port",
  "enable-rcon",
  "management-server-secret",
  "management-server-enabled",
  "management-server-port",
  "white-list",
  "enforce-whitelist",
]);

export async function preserveCredentials(dataPath: string, stagedPath: string): Promise<void> {
  const read = async (root: string) => {
    try {
      return await readFile(join(root, "server.properties"), "utf8");
    } catch (error) {
      if (isMissing(error)) return "";
      throw error;
    }
  };
  const current = await read(dataPath);
  const staged = await read(stagedPath);
  const key = (line: string) => /^\s*([^#!\s:=]+)\s*[:=]/.exec(line)?.[1] ?? "";
  const lines = staged.split(/\r?\n/).filter((line) => !CURRENT_PROPERTIES.has(key(line)));
  lines.push(...current.split(/\r?\n/).filter((line) => CURRENT_PROPERTIES.has(key(line))));
  const file = await open(join(stagedPath, "server.properties"), "w", 0o600);
  try {
    await file.writeFile(`${lines.join("\n").trimEnd()}\n`);
    await file.sync();
  } finally {
    await file.close();
  }
}

// Restoring an older native snapshot must not re-enable the modpack scheduler.
async function ftbConfigExists(dataPath: string): Promise<boolean> {
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
    throw new ControllerError(
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
      throw new ControllerError(
        "BACKUP_SETUP_REQUIRED",
        "The FTB backup configuration format is unsupported. Set auto and force_on_shutdown to false in the world's serverconfig file before retrying restore.",
      );
    text = text.replace(pattern, `$1${key}: false$2`);
  }
  await atomicText(path, text);
  const owner = await lstat(directory);
  await chown(path, owner.uid, owner.gid);
  await chmod(path, 0o644);
}
