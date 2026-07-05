// apps/backend/src/features/invitations/invitations.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import {
  createInvitationSchema,
  invitationResponseSchema,
  type InvitationResponse,
} from "@minecraft-server/shared/schemas";
import type { Request } from "express";
import { invitationIdParamsSchema } from "./invitations.schemas.js";
import type { InvitationService } from "./invitations.service.js";

export class InvitationController {
  public constructor(private readonly invitationService: InvitationService) {}

  public async invite(req: Request): Promise<InvitationResponse> {
    const input = createInvitationSchema.parse(req.body);
    const user = getAuthenticatedUser(req);

    const invitation = await this.invitationService.create({
      ...input,
      invitedByUserId: user.id,
    });

    return invitationResponseSchema.parse(invitation);
  }

  public async delete(req: Request): Promise<InvitationResponse> {
    const { invitationId } = invitationIdParamsSchema.parse(req.params);
    const invitation = await this.invitationService.delete(invitationId);

    return invitationResponseSchema.parse(invitation);
  }
}
