// apps/backend/src/features/invitations/invitations.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import { parseOrThrow } from "@/validation/parse.js";
import {
  createInvitationSchema,
  invitationIdSchema,
  invitationResponseSchema,
} from "@minecraft-server/shared/invitations";
import type { Request, Response } from "express";
import type { InvitationService } from "./invitations.service.js";

export class InvitationController {
  public constructor(private readonly invitationService: InvitationService) {}

  public list = async (_req: Request, res: Response): Promise<void> => {
    const invitations = await this.invitationService.list();

    res
      .status(200)
      .json(invitations.map((invitation) => invitationResponseSchema.parse(invitation)));
  };

  public invite = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(createInvitationSchema, req.body);
    const user = getAuthenticatedUser(req);

    const invitation = await this.invitationService.create({
      ...input,
      invitedByUserId: user.id,
    });

    res.status(200).json(invitationResponseSchema.parse(invitation));
  };

  public delete = async (req: Request, res: Response): Promise<void> => {
    const invitationId = parseOrThrow(invitationIdSchema, req.params.invitationId);
    const invitation = await this.invitationService.delete(invitationId);

    res.status(200).json(invitationResponseSchema.parse(invitation));
  };
}
