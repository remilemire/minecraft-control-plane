// apps/backend/src/errors/translators/invitations.translator.ts

import { ApiError } from "@/errors/api-error.js";
import { InvitationNotFoundError } from "@/features/invitations/invitations.errors.js";

export function translateInvitationError(error: unknown): ApiError | null {
  if (error instanceof InvitationNotFoundError) {
    return new ApiError({
      status: 404,
      code: "INVITATION_NOT_FOUND",
      message: error.message,
      cause: error,
    });
  }

  return null;
}
