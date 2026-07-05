// apps/backend/src/errors/api-error.ts

import { ERROR_CATALOG, type ErrorCode } from "./error-catalog.js";
import type { ErrorResponse } from "./error-response.js";
import type { ErrorStatus } from "./types.js";
import {
  createValidationIssue,
  type ValidationIssue,
  type ValidationIssueInput,
} from "./validation-catalog.js";

export interface ApiErrorOptions {
  readonly issues?: ValidationIssueInput[];
  readonly cause?: Error;
}

export abstract class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: ErrorStatus;
  public readonly issues?: readonly ValidationIssue[];

  protected constructor(
    code: ErrorCode, // Can't be abstract, must be available before call to super
    message?: string,
    { issues, cause }: ApiErrorOptions = {},
  ) {
    super(message ?? ERROR_CATALOG[code].message, { cause: cause });

    this.name = this.constructor.name;
    this.code = code;
    this.status = ERROR_CATALOG[code].status;

    if (issues !== undefined) {
      this.issues = issues.map(createValidationIssue);
    }
  }

  public toResponse(): ErrorResponse {
    return {
      status: this.status,
      body: {
        error: this.name,
        message: this.message,
        code: this.code,
        ...(this.issues !== undefined ? { errors: this.issues } : {}),
      },
    };
  }
}
