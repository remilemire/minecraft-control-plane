// packages/shared/src/features/invitations/invitations.errors.ts

import type { ErrorMeta } from "@/common/index.js";

export const invitationErrorMeta = {
  INVITATION_NOT_FOUND: { kind: "NOT_FOUND" },
  INVITATION_ALREADY_EXISTS: { kind: "CONFLICT" },
} as const satisfies ErrorMeta;

export type InvitationErrorCode = keyof typeof invitationErrorMeta;
