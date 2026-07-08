// apps/backend/src/errors/translation/violation.ts

import { DbViolationError, type DbError } from "@/db/errors.js";
import type { ApiError } from "@/errors/api-error.js";
import {
  AlreadyExistsError,
  InUseError,
  ServerError,
  ValidationError,
} from "@/errors/http-errors.js";

export function translateDbError(error: DbError): ApiError {
  if (error instanceof DbViolationError) {
    switch (error.code) {
      case "CHECK":
        return new ValidationError(undefined, {
          ...(error.columns !== undefined
            ? {
                errors: error.columns.map((col) => ({
                  path: [col],
                  code: "INVALID_VALUE",
                })),
              }
            : {}),
          cause: error,
        });

      case "NOT_NULL":
        return new ValidationError(undefined, {
          ...(error.columns !== undefined
            ? {
                errors: error.columns.map((col) => ({
                  path: [col],
                  code: "MISSING_FIELD",
                })),
              }
            : {}),
          cause: error,
        });

      case "FOREIGN_KEY":
        return new InUseError(undefined, { cause: error });

      case "UNIQUE":
        return new AlreadyExistsError(undefined, { cause: error });
    }
  }

  return new ServerError();
}
