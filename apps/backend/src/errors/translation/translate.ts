// apps/backend/src/errors/translation/translate.ts

import { DbError } from "@/db/errors.js";
import { ApiError, ServerError } from "@/errors/index.js";
import { translateDbError } from "./violation.js";

export function translateError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof DbError) {
    return translateDbError(error);
  }

  return new ServerError();
}
