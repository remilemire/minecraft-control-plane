import type { MinecraftBackupErrorCode } from "@minecraft-control-plane/shared/minecraft";

export class BackupError extends Error {
  public constructor(
    public readonly code: MinecraftBackupErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function publicFailure(error: unknown): string {
  if (error instanceof BackupError) return error.message;
  if (error instanceof Error && "code" in error && error.code === "ENOSPC") {
    return "There is not enough disk space. Free space before retrying.";
  }
  return "The operation failed. Check the controller logs before retrying.";
}
