// packages/shared/src/features/invitations/invitations.schemas.ts

import { emailSchema } from "@/common/index.js";
import { z } from "zod";

export const invitationIdSchema = z.uuid();

export const createInvitationSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z
  .object({
    acceptedByUserId: z.uuid(),
  })
  .strict();

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const invitationResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.date(),
  expiresAt: z.date(),
  acceptedAt: z.date().nullable(),
});

export type InvitationResponse = z.infer<typeof invitationResponseSchema>;
