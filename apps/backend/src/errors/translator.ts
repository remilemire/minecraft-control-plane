// apps/backend/src/errors/translator.ts

import {
  errorMeta,
  type ErrorCode,
  type ErrorResponse,
} from "@minecraft-control-plane/shared/errors";
import { AppError } from "./app-error.js";
import { ERROR_KIND_TO_HTTP_STATUS, type HttpErrorStatus } from "./http-status.js";
import { errorCatalog } from "./catalog.js";
import { normalizeValidationIssue, type ValidationIssueData } from "./validation-issues.js";
import { ValidationError } from "./validation-error.js";

export interface HttpErrorResponse {
  readonly status: HttpErrorStatus;
  readonly body: ErrorResponse;
}

export function translateError(error: unknown): HttpErrorResponse {
  if (error instanceof ValidationError) {
    return createHttpErrorResponse(error.code, error.issues);
  }
  if (error instanceof AppError) {
    return createHttpErrorResponse(error.code);
  }

  return createHttpErrorResponse("INTERNAL");
}

function createHttpErrorResponse(
  code: ErrorCode,
  issues?: ValidationIssueData[],
): HttpErrorResponse {
  const kind = errorMeta[code].kind;
  return {
    status: ERROR_KIND_TO_HTTP_STATUS[kind],
    body: {
      kind: kind,
      code: code,
      message: errorCatalog[code].message,
      ...(issues !== undefined ? { issues: issues.map(normalizeValidationIssue) } : {}),
    },
  };
}
