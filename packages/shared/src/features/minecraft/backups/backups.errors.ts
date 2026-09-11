import type { ErrorMeta } from "@/common/index.js";

export const minecraftBackupErrorMeta = {
  MINECRAFT_MAINTENANCE: { kind: "CONFLICT" },
  BACKUP_NOT_FOUND: { kind: "NOT_FOUND" },
  BACKUP_INCOMPATIBLE: { kind: "CONFLICT" },
  BACKUP_INVALID: { kind: "VALIDATION" },
  BACKUP_STORAGE_FULL: { kind: "CONFLICT" },
  BACKUP_SETUP_REQUIRED: { kind: "CONFLICT" },
  BACKUP_REQUEST_CONFLICT: { kind: "CONFLICT" },
  BACKUP_RECOVERY_REQUIRED: { kind: "CONFLICT" },
  BACKUP_CONTROLLER_ERROR: { kind: "SERVICE_UNAVAILABLE" },
} as const satisfies ErrorMeta;
export type MinecraftBackupErrorCode = keyof typeof minecraftBackupErrorMeta;
