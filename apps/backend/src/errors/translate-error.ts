// apps/backend/src/errors/translate-error.ts

import { ApiError } from "./api-error.js";
import { translateAuthError } from "./translators/auth.translator.js";
import { translateCsrfError } from "./translators/csrf.translator.js";
import { translateDbError } from "./translators/db.translator.js";
import { translateInvitationError } from "./translators/invitations.translator.js";
import { translateMinecraftError } from "./translators/minecraft.translator.js";
import { translateSessionError } from "./translators/sessions.translator.js";
import { translateZodError } from "./translators/zod.translator.js";

const translators = [
  translateZodError,
  translateDbError,
  translateAuthError,
  translateSessionError,
  translateInvitationError,
  translateMinecraftError,
  translateCsrfError,
];

export function translateError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  for (const translate of translators) {
    const apiError = translate(error);
    if (apiError !== null) {
      return apiError;
    }
  }

  return new ApiError({
    status: 500,
    code: "SERVER",
    message: "Something went wrong.",
    cause: error,
  });
}
