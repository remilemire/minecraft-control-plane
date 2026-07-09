// apps/backend/src/errors/translators/db.translator.ts

import { DbError, DbViolationError } from "@/db/errors.js";
import { ApiError } from "@/errors/api-error.js";

export function translateDbError(error: unknown): ApiError | null {
  if (!(error instanceof DbError)) {
    return null;
  }

  if (error instanceof DbViolationError) {
    return translateDbViolationError(error);
  }

  return serverError(error);
}

function translateDbViolationError(error: DbViolationError): ApiError {
  switch (error.code) {
    case "UNIQUE":
      return new ApiError({
        status: 409,
        code: "ALREADY_EXISTS",
        message: "Item already exists.",
        cause: error,
      });

    case "FOREIGN_KEY":
      return new ApiError({
        status: 409,
        code: "IN_USE",
        message: "Item in use.",
        cause: error,
      });

    case "NOT_NULL":
      return validationError(error, "missing_field", "This field is required.");

    case "CHECK":
      return validationError(error, "invalid_value", "Invalid value.");

    case "INTEGRITY":
      return serverError(error);
  }
}

function validationError(error: DbViolationError, code: string, message: string): ApiError {
  return new ApiError({
    status: 422,
    code: "VALIDATION",
    message: "There was a problem with the submission.",
    ...(error.columns !== undefined
      ? { issues: error.columns.map((column) => ({ code, message, path: [column] })) }
      : {}),
    cause: error,
  });
}

function serverError(error: DbError): ApiError {
  return new ApiError({
    status: 500,
    code: "SERVER",
    message: "Something went wrong.",
    cause: error,
  });
}
