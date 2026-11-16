import type { MinecraftBackupErrorCode } from "@minecraft-control-plane/shared/minecraft";

// Keep the existing wire codes while sharing failures across controller tasks.
export class ControllerError extends Error {
  public constructor(
    public readonly code: MinecraftBackupErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Operator-facing configuration failures retain the controller's existing 500 response. */
export class ControllerConfigurationError extends Error {}

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

export function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
export function publicFailure(error: unknown): string {
  if (error instanceof ControllerError) return error.message;
  if (error instanceof Error && "code" in error && error.code === "ENOSPC")
    return "There is not enough disk space. Free space before retrying.";
  return "The operation failed. Check the controller logs before retrying.";
}
