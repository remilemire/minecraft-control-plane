// apps/backend/src/errors/translators/sessions.translator.ts

import { ApiError } from "@/errors/api-error.js";
import { SessionNotFoundError } from "@/features/sessions/sessions.errors.js";

export function translateSessionError(error: unknown): ApiError | null {
  if (error instanceof SessionNotFoundError) {
    return new ApiError({
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: error.message,
      cause: error,
    });
  }

  return null;
}
