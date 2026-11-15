import type { MinecraftBackupErrorCode } from "@minecraft-control-plane/shared/minecraft";

// Keep the existing wire codes while sharing failures across controller tasks.
export class MaintenanceError extends Error {
  public constructor(
    public readonly code: MinecraftBackupErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function dockerUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (
    "code" in error &&
    ["ECONNREFUSED", "ECONNRESET", "EPIPE", "ETIMEDOUT"].includes(String(error.code))
  )
    return true;
  if (
    "code" in error &&
    error.code === "ENOENT" &&
    "syscall" in error &&
    error.syscall === "connect"
  )
    return true;
  return "cause" in error && dockerUnavailable(error.cause);
}
