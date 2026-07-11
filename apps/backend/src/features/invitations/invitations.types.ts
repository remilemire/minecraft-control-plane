// apps/backend/src/features/invitations/invitations.types.ts

import type { CreateInvitationInput } from "@minecraft-server/shared/invitations";

export type CreateInvitationData = CreateInvitationInput & { readonly invitedByUserId: string };
