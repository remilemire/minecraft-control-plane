// apps/backend/src/features/invitations/invitations.repository.ts

import { type Db } from "@/db/client.js";
import { DbError, withDbErrors } from "@/db/errors.js";
import { invitations, type Invitation, type NewInvitation } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";

export class InvitationRepository {
  public constructor(private readonly db: Db) {}

  public async findByEmail(email: string): Promise<Invitation | null> {
    const [invitation] = await withDbErrors(() =>
      this.db.select().from(invitations).where(eq(invitations.email, email)),
    );
    return invitation ?? null;
  }

  public async findById(invitationId: string): Promise<Invitation | null> {
    const [invitation] = await withDbErrors(() =>
      this.db.select().from(invitations).where(eq(invitations.id, invitationId)),
    );
    return invitation ?? null;
  }

  public async create(input: NewInvitation): Promise<Invitation> {
    const [invitation] = await withDbErrors(() =>
      this.db.insert(invitations).values(input).returning(),
    );

    if (invitation === undefined) {
      throw new DbError("Failed to create invitation.");
    }

    return invitation;
  }

  public async deleteById(invitationId: string): Promise<Invitation | null> {
    const [invitation] = await withDbErrors(() =>
      this.db.delete(invitations).where(eq(invitations.id, invitationId)).returning(),
    );
    return invitation ?? null;
  }
}
