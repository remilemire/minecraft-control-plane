// apps/backend/src/errors/error-response.ts

import type { ErrorCode, ErrorStatus } from "./error-catalog.js";
import type { ValidationIssue } from "./validation-catalog.js";

export type ErrorResponse = {
  readonly status: ErrorStatus;
  readonly body: {
    readonly error: string;
    readonly message: string;
    readonly code: ErrorCode;
    readonly errors?: readonly ValidationIssue[];
  };
};
