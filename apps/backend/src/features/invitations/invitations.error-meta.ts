// apps/backend/src/features/invitations/invitations.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { InvitationErrorCode } from "@minecraft-server/shared/invitations";

export const invitationErrorMeta = {
  INVITATION_NOT_FOUND: { message: "Invitation not found." },
  INVITATION_ALREADY_EXISTS: { message: "This email already has a pending invitation." },
} as const satisfies ErrorMeta<InvitationErrorCode>;
