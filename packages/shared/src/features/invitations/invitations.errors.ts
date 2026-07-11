// packages/shared/src/features/invitations/invitations.errors.ts

import type { ErrorCatalog } from "../../common/errors.js";

export const invitationErrorCatalog = {
  INVITATION_NOT_FOUND: { kind: "NOT_FOUND" },
} as const satisfies ErrorCatalog;

export type InvitationErrorCode = keyof typeof invitationErrorCatalog;
