// apps/backend/src/features/invitations/invitations.service.ts

import { env } from "@/config/env.js";
import type { Invitation } from "@/db/schema/invitations.js";
import { NotFoundError } from "@/errors/index.js";
import type { AcceptInvitationInput } from "@minecraft-server/shared/schemas";
import type { InvitationRepository } from "./invitations.repository.js";
import type { CreateInvitationData } from "./invitations.types.js";

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

  public async markAccepted(
    id: string,
    { acceptedByUserId }: AcceptInvitationInput,
  ): Promise<Invitation> {
    const invitation = await this.invitations.updateById(id, {
      acceptedByUserId,
      acceptedAt: new Date(),
    });

    if (invitation === null) {
      throw new NotFoundError("Invitation not found.");
    }

    return invitation;
  }

  public async isInvited(email: string) {
    const invitation = await this.invitations.findByEmail(email);
    return (
      invitation !== null && invitation.acceptedAt === null && invitation.expiresAt > new Date()
    );
  }

  public async delete(id: string): Promise<Invitation> {
    const invitation = await this.invitations.deleteById(id);

    if (invitation === null) {
      throw new NotFoundError("Invitation not found.");
    }

    return invitation;
  }
}
