import { ControllerError } from "@/errors.js";
const EXCLUDED_ROOTS = new Set([
  "logs",
  "cache",
  ".cache",
  ".mixin.out",
  "ftbbackups3",
  "backups",
  "backup-state",
  "backup-recovery",
]);
const PRESERVED_ROOTS = new Set([
  "eula.txt",
  "whitelist.json",
  "ops.json",
  "banned-ips.json",
  "banned-players.json",
  ".rcon-cli.env",
  ".rcon-cli.yaml",
]);
export function excluded(path: string): boolean {
  return (
    EXCLUDED_ROOTS.has(path.split("/")[0] ?? "") ||
    /(?:^|\/)(?:session\.lock|.*\.(?:tmp|log|neoforge-tmp))$/.test(path)
  );
}
export function preserved(name: string): boolean {
  return PRESERVED_ROOTS.has(name) || excluded(name);
}

export function safeArchivePath(name: string): string {
  const normalized = name.replace(/\/$/, "");
  if (
    !normalized ||
    name.includes("\\") ||
    [...name].some((c) => c.charCodeAt(0) < 32) ||
    name.startsWith("/") ||
    /^[a-z]:/i.test(name) ||
    normalized.split("/").some((p) => p === ".." || p === "." || p === "")
  ) {
    throw new ControllerError("BACKUP_INVALID", "The archive contains an unsafe file path.");
  }
  return normalized;
}
