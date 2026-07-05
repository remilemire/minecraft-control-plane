// apps/backend/src/errors/translation/translate.ts

import { DbError } from "@/db/db-errors.js";
import { ApiError } from "@/errors/api-error.js";
import { UnknownError } from "@/errors/http-errors.js";
import { translateDbError } from "./violation.js";

export function translateError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof DbError) {
    return translateDbError(error);
  }

  return new UnknownError();
}
