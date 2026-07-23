// apps/backend/src/features/invitations/invitations.service.ts

import { env } from "@/config/env.js";
import type { Invitation } from "@/db/schema/index.js";
import type { AcceptInvitationInput } from "@minecraft-server/shared/invitations";
import type { InvitationRepository } from "./invitations.repository.js";
import type { CreateInvitationData } from "./invitations.types.js";
import { AppError } from "@/errors/app-error.js";

export class InvitationService {
  public constructor(private readonly invitations: InvitationRepository) {}

  public async list(): Promise<Invitation[]> {
    const invitations = await this.invitations.findAll();
    return invitations;
  }

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
      throw new AppError("INVITATION_NOT_FOUND");
    }

    return invitation;
  }

  // A pending invitation is one that can still be consumed: it exists, has
  // not been accepted, and has not expired.
  public async findPending(email: string): Promise<Invitation | null> {
    const invitation = await this.invitations.findByEmail(email);
    const isPending =
      invitation !== null && invitation.acceptedAt === null && invitation.expiresAt > new Date();
    return isPending ? invitation : null;
  }

  public async isInvited(email: string) {
    return (await this.findPending(email)) !== null;
  }

  public async delete(id: string): Promise<Invitation> {
    const invitation = await this.invitations.deleteById(id);

    if (invitation === null) {
      throw new AppError("INVITATION_NOT_FOUND");
    }

    return invitation;
  }
}
