// apps/backend/src/features/invitations/invitations.types.ts

import type { CreateInvitationInput } from "@minecraft-control-plane/shared/invitations";

export type CreateInvitationData = CreateInvitationInput & { readonly invitedByUserId: string };
