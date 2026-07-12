// apps/backend/src/features/users/users.repository.integration.test.ts

import { db } from "@/db/client.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { UserRepository } from "./users.repository.js";

describe("UserRepository", () => {
  const repository = new UserRepository(db);

  it("creates a user and finds it by id and google id", async () => {
    const created = await repository.create({
      googleId: `google-${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
    });

    expect(await repository.findById(created.id)).toEqual(created);
    expect(await repository.findByGoogleId(created.googleId)).toEqual(created);
  });

  it("returns null for an unknown id or google id", async () => {
    expect(await repository.findById(randomUUID())).toBeNull();
    expect(await repository.findByGoogleId("nope")).toBeNull();
  });

  it("maps a duplicate google id to GOOGLE_ID_TAKEN", async () => {
    const existing = await createUser();

    await expect(
      repository.create({ googleId: existing.googleId, email: `${randomUUID()}@example.com` }),
    ).rejects.toMatchObject({ code: "GOOGLE_ID_TAKEN" });
  });

  it("maps a duplicate email to EMAIL_TAKEN", async () => {
    const existing = await createUser();

    await expect(
      repository.create({ googleId: `google-${randomUUID()}`, email: existing.email }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });
});
