// apps/backend/src/features/invitations/invitations.service.ts

import { env } from "@/config/env.js";
import type { Invitation } from "@/db/schema/invitations.js";
import { NotFoundError } from "@/errors/http-errors.js";
import type { InvitationRepository } from "./invitations.repository.js";
import type { AcceptInvitationData, CreateInvitationData } from "./invitations.types.js";

export class InvitationService {
  public constructor(readonly invitations: InvitationRepository) {}

  public async create(input: CreateInvitationData): Promise<Invitation> {
    const expiresAt = new Date(Date.now() + env.INVITATION_TTL_MS);

    const invitation = await this.invitations.create({
      expiresAt,
      ...input,
    });

    return invitation;
  }

  public async markAccepted({
    invitationId,
    acceptedByUserId,
  }: AcceptInvitationData): Promise<Invitation> {
    const invitation = await this.invitations.findById(invitationId);

    if (invitation === null) {
      throw new NotFoundError("Invitation not found.");
    }

    invitation.acceptedAt = new Date();
    invitation.acceptedByUserId = acceptedByUserId;

    return invitation;
  }

  public async isInvited(email: string) {
    const invitation = await this.invitations.findByEmail(email);
    return (
      invitation !== null && invitation.acceptedAt === null && invitation.expiresAt > new Date()
    );
  }

  public async delete(invitationId: string): Promise<Invitation> {
    const invitation = await this.invitations.deleteById(invitationId);

    if (invitation === null) {
      throw new NotFoundError("Invitation not found.");
    }

    return invitation;
  }
}
