// apps/backend/src/errors/app-error.ts

import type { ErrorCode } from "@minecraft-server/shared/errors";

export interface AppErrorOptions extends ErrorOptions {
  readonly message?: string;
}

export class AppError extends Error {
  public readonly code: ErrorCode;

  public constructor(code: ErrorCode, { message, ...rest }: AppErrorOptions = {}) {
    super(message ?? code, rest);
    this.name = new.target.name;
    this.code = code;
  }
}
