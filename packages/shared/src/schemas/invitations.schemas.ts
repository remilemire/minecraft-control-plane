// packages/shared/src/schemas/invitations.schemas.ts

import z from "zod";
import { emailSchema } from "./common.schemas.js";

export const createInvitationSchema = z.object({
  email: emailSchema,
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  acceptedByUserId: z.uuid(),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const invitationResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.date(),
  expiresAt: z.date(),
  acceptedAt: z.date(),
});

export type InvitationResponse = z.infer<typeof invitationResponseSchema>;
