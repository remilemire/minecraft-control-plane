// apps/backend/src/features/invitations/invitations.types.ts

import type { CreateInvitationInput } from "@minecraft-server/shared/schemas";

export type CreateInvitationData = CreateInvitationInput & { readonly invitedByUserId: string };

export interface AcceptInvitationData {
  readonly invitationId: string;
  readonly acceptedByUserId: string;
}
