// apps/backend/src/errors/validation-error.ts

import type { ErrorCodeForKind } from "@minecraft-control-plane/shared/errors";
import { AppError, type AppErrorOptions } from "./app-error.js";
import type { ValidationIssueData } from "./validation-issues.js";

export interface ValidationErrorOptions extends AppErrorOptions {
  readonly code?: ErrorCodeForKind<"VALIDATION">;
}

export class ValidationError extends AppError {
  public readonly issues: ValidationIssueData[];

  public constructor(
    issues: ValidationIssueData[],
    { code = "VALIDATION_FAILED", ...rest }: ValidationErrorOptions = {},
  ) {
    super(code, rest);
    this.issues = issues;
  }
}
