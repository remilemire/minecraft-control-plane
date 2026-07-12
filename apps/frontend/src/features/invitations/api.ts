// apps/frontend/src/features/invitations/api.ts

import { apiRequest } from "@/lib/apiClient";
import {
  createInvitationSchema,
  invitationResponseSchema,
} from "@minecraft-server/shared/invitations";
import { z } from "zod";

// Wire timestamps arrive as ISO strings; coerce them back into Dates.
export const invitationSchema = invitationResponseSchema.extend({
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  acceptedAt: z.coerce.date().nullable(),
});

export type Invitation = z.infer<typeof invitationSchema>;

export function fetchInvitations(): Promise<Invitation[]> {
  return apiRequest("GET", "/invitations", { schema: z.array(invitationSchema) });
}

export function createInvitation(email: string): Promise<Invitation> {
  return apiRequest("POST", "/invitations", {
    schema: invitationSchema,
    body: createInvitationSchema.parse({ email }),
  });
}

export function deleteInvitation(invitationId: string): Promise<Invitation> {
  return apiRequest("DELETE", `/invitations/${invitationId}`, { schema: invitationSchema });
}
