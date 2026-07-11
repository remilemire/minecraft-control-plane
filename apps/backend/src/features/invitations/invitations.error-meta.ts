// apps/backend/src/features/invitations/invitations.error-meta.ts

import type { ErrorMeta } from "@/errors/meta-types.js";
import type { InvitationErrorCode } from "@minecraft-server/shared/invitations";

export const invitationErrorMeta = {
  INVITATION_NOT_FOUND: { message: "Invitation not found." },
} as const satisfies ErrorMeta<InvitationErrorCode>;
