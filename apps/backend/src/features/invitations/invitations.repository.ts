// apps/backend/src/features/invitations/invitations.repository.ts

import { INVITATIONS_CONSTRAINTS } from "@/infrastructure/db/constraints.js";
import { withDbErrors, type DatabaseProvider } from "@/infrastructure/db/index.js";
import {
  invitations,
  type Invitation,
  type NewInvitation,
} from "@/infrastructure/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import { eq } from "drizzle-orm";

export class InvitationRepository {
  public constructor(private readonly databaseProvider: DatabaseProvider) {}

  public async findAll(): Promise<Invitation[]> {
    return this.databaseProvider.get().select().from(invitations);
  }

  public async findByEmail(email: string): Promise<Invitation | null> {
    const [invitation] = await withDbErrors(() =>
      this.databaseProvider.get().select().from(invitations).where(eq(invitations.email, email)),
    );

    return invitation ?? null;
  }

  public async findById(id: string): Promise<Invitation | null> {
    const [invitation] = await withDbErrors(() =>
      this.databaseProvider.get().select().from(invitations).where(eq(invitations.id, id)),
    );
    return invitation ?? null;
  }

  public async create(input: NewInvitation): Promise<Invitation> {
    const [invitation] = await withDbErrors(
      () => this.databaseProvider.get().insert(invitations).values(input).returning(),
      { [INVITATIONS_CONSTRAINTS.EMAIL_UNIQUE]: "INVITATION_ALREADY_EXISTS" },
    );

    if (invitation === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create invitation." });
    }

    return invitation;
  }

  public async updateById(id: string, input: Partial<NewInvitation>): Promise<Invitation | null> {
    const [invitation] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .update(invitations)
        .set(input)
        .where(eq(invitations.id, id))
        .returning(),
    );

    return invitation ?? null;
  }

  public async deleteById(id: string): Promise<Invitation | null> {
    const [invitation] = await withDbErrors(() =>
      this.databaseProvider.get().delete(invitations).where(eq(invitations.id, id)).returning(),
    );

    return invitation ?? null;
  }
}
