// apps/backend/src/features/invitations/invitations.repository.integration.test.ts

import { db } from "@/db/client.js";
import { createInvitation } from "@test/helpers/factories/invitation.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { InvitationRepository } from "./invitations.repository.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("InvitationRepository", () => {
  const repository = new InvitationRepository(db);

  it("creates an invitation and finds it by email", async () => {
    const user = await createUser();

    const created = await repository.create({
      email: "steve@example.com",
      invitedByUserId: user.id,
      expiresAt: new Date(Date.now() + ONE_DAY_MS),
    });

    expect(await repository.findByEmail("steve@example.com")).toEqual(created);
  });

  it("maps a duplicate email to INVITATION_ALREADY_EXISTS", async () => {
    const existing = await createInvitation({ email: "dup@example.com" });

    await expect(
      repository.create({
        email: "dup@example.com",
        invitedByUserId: existing.invitedByUserId,
        expiresAt: new Date(Date.now() + ONE_DAY_MS),
      }),
    ).rejects.toMatchObject({ code: "INVITATION_ALREADY_EXISTS" });
  });

  it("returns null when updating a missing invitation", async () => {
    expect(await repository.updateById(randomUUID(), { acceptedAt: new Date() })).toBeNull();
  });

  it("deletes an invitation and returns the removed row", async () => {
    const created = await createInvitation();

    expect(await repository.deleteById(created.id)).toEqual(created);
    expect(await repository.findById(created.id)).toBeNull();
  });
});
