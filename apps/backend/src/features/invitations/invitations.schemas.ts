// apps/backend/src/features/invitations/invitations.schemas.ts

import z from "zod";

export const invitationIdParamsSchema = z.object({
  invitationId: z.uuid(),
});
