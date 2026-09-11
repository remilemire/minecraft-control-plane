import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { MinecraftBackupErrorCode } from "@minecraft-control-plane/shared/minecraft";

export const minecraftBackupErrorCatalog = {
  MINECRAFT_MAINTENANCE: {
    message:
      "Minecraft maintenance is in progress or the server is not ready. Wait for it to finish and refresh.",
  },
  BACKUP_NOT_FOUND: { message: "That backup or operation no longer exists." },
  BACKUP_INCOMPATIBLE: {
    message:
      "The backup version does not match the verified, pinned server version. Check its recovery preview.",
  },
  BACKUP_INVALID: { message: "The backup or request is invalid. Check the operation details." },
  BACKUP_STORAGE_FULL: {
    message: "There is not enough disk space for the backup and recovery files.",
  },
  BACKUP_SETUP_REQUIRED: {
    message: "Stop Minecraft and run make backup-migrate before using panel backups.",
  },
  BACKUP_REQUEST_CONFLICT: { message: "This request was already used for a different operation." },
  BACKUP_RECOVERY_REQUIRED: {
    message:
      "Recovery needs attention. Keep Minecraft stopped, inspect the controller logs, and run make backup-recover.",
  },
  BACKUP_CONTROLLER_ERROR: {
    message: "The backup controller is unavailable or could not complete the request.",
  },
} as const satisfies ErrorCatalog<MinecraftBackupErrorCode>;
