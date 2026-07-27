// apps/backend/src/features/invitations/invitations.error-catalog.ts

import type { ErrorCatalog } from "@/errors/catalog-contracts.js";
import type { InvitationErrorCode } from "@minecraft-control-plane/shared/invitations";

export const invitationErrorCatalog = {
  INVITATION_NOT_FOUND: { message: "Invitation not found." },
  INVITATION_ALREADY_EXISTS: { message: "This email already has a pending invitation." },
} as const satisfies ErrorCatalog<InvitationErrorCode>;
