// apps/backend/src/errors/translators/csrf.translator.ts

import { ApiError } from "@/errors/api-error.js";
import { InvalidCsrfTokenError } from "@/security/csrf.errors.js";

export function translateCsrfError(error: unknown): ApiError | null {
  if (error instanceof InvalidCsrfTokenError) {
    return new ApiError({
      status: 403,
      code: "INVALID_CSRF_TOKEN",
      message: error.message,
      cause: error,
    });
  }

  return null;
}
