import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isMissing } from "./errors.js";

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
