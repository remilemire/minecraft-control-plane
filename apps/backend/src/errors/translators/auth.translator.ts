// apps/backend/src/errors/translators/auth.translator.ts

import { ApiError } from "@/errors/api-error.js";
import {
  AdminRequiredError,
  InvalidGoogleCredentialError,
  InvalidSessionError,
  NotInvitedError,
  UnauthenticatedError,
} from "@/features/auth/auth.errors.js";

export function translateAuthError(error: unknown): ApiError | null {
  if (error instanceof UnauthenticatedError) {
    return unauthorized("UNAUTHENTICATED", error);
  }
  if (error instanceof InvalidSessionError) {
    return unauthorized("INVALID_SESSION", error);
  }
  if (error instanceof InvalidGoogleCredentialError) {
    return unauthorized("INVALID_GOOGLE_CREDENTIAL", error);
  }
  if (error instanceof NotInvitedError) {
    return forbidden("NOT_INVITED", error);
  }
  if (error instanceof AdminRequiredError) {
    return forbidden("ADMIN_REQUIRED", error);
  }

  return null;
}

function unauthorized(code: string, error: Error): ApiError {
  return new ApiError({ status: 401, code, message: error.message, cause: error });
}

function forbidden(code: string, error: Error): ApiError {
  return new ApiError({ status: 403, code, message: error.message, cause: error });
}
