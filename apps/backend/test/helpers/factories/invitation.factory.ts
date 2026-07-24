// apps/backend/test/helpers/factories/invitation.factory.ts

import { db } from "@/infrastructure/db/index.js";
import { invitations, type Invitation, type NewInvitation } from "@/infrastructure/db/schemas.js";
import { createUser } from "./user.factory.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let sequence = 0;

export async function createInvitation(
  overrides: Partial<NewInvitation> = {},
): Promise<Invitation> {
  const n = ++sequence;
  const invitedByUserId = overrides.invitedByUserId ?? (await createUser()).id;

  const [invitation] = await db
    .insert(invitations)
    .values({
      email: `invitee${n}@example.com`,
      expiresAt: new Date(Date.now() + 7 * ONE_DAY_MS),
      ...overrides,
      invitedByUserId,
    })
    .returning();

  if (invitation === undefined) {
    throw new Error("createInvitation: insert returned no row.");
  }

  return invitation;
}
