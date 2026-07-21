// apps/backend/src/features/auth/oauth-identities.repository.integration.test.ts

import { OAUTH_IDENTITIES_CONSTRAINTS } from "@/db/constraints.js";
import { db } from "@/db/client.js";
import { users } from "@/db/schema/index.js";
import { createOAuthIdentity } from "@test/helpers/factories/oauth-identity.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { OAuthIdentityRepository } from "./oauth-identities.repository.js";

describe("OAuthIdentityRepository", () => {
  const repository = new OAuthIdentityRepository(db);

  it("finds an identity with its user by provider and subject", async () => {
    const user = await createUser();
    const identity = await createOAuthIdentity({ userId: user.id, subject: "google-subject-1" });

    const result = await repository.findBySubjectWithUser("google", "google-subject-1");

    expect(result?.identity).toEqual(identity);
    expect(result?.user).toEqual(user);
  });

  it("returns null for an unknown subject", async () => {
    expect(await repository.findBySubjectWithUser("google", "unknown-subject")).toBeNull();
  });

  it("rejects a duplicate (provider, subject) pair", async () => {
    const existing = await createOAuthIdentity();

    await expect(
      createOAuthIdentity({ provider: existing.provider, subject: existing.subject }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        constraint: OAUTH_IDENTITIES_CONSTRAINTS.PROVIDER_SUBJECT_UNIQUE,
      }),
    });
  });

  it("cascades identity deletion when the user is deleted", async () => {
    const user = await createUser();
    const identity = await createOAuthIdentity({ userId: user.id });

    await db.delete(users).where(eq(users.id, user.id));

    expect(await repository.findBySubjectWithUser(identity.provider, identity.subject)).toBeNull();
  });
});
