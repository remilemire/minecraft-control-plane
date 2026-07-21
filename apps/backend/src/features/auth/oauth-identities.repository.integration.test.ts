// apps/backend/src/features/auth/oauth-identities.repository.integration.test.ts

import { OAUTH_IDENTITIES_CONSTRAINTS } from "@/db/constraints.js";
import { db } from "@/db/client.js";
import { TransactionRunner } from "@/db/transactions.js";
import { users } from "@/db/schema/index.js";
import { UserRepository } from "@/features/users/users.repository.js";
import { createOAuthIdentity } from "@test/helpers/factories/oauth-identity.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { randomUUID } from "crypto";
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

// Registration (AuthService.registerInvited) creates a user and its first
// identity as a single unit of work via TransactionRunner. These tests prove
// that mechanism actually rolls back both writes, not just the identity one,
// when the identity insert fails partway through.
describe("registration transaction (TransactionRunner + withTx)", () => {
  it("rolls back the user insert when the identity insert violates the unique constraint", async () => {
    const transactionRunner = new TransactionRunner(db);
    const userRepository = new UserRepository(db);
    const identityRepository = new OAuthIdentityRepository(db);

    const existing = await createOAuthIdentity();
    const email = `${randomUUID()}@example.com`;

    const attempt = transactionRunner.run(async (tx) => {
      const user = await userRepository.withTx(tx).create({ email });

      await identityRepository.withTx(tx).create({
        userId: user.id,
        provider: existing.provider,
        subject: existing.subject,
      });
    });

    await expect(attempt).rejects.toMatchObject({
      code: "INTERNAL",
      cause: expect.objectContaining({
        cause: expect.objectContaining({
          constraint: OAUTH_IDENTITIES_CONSTRAINTS.PROVIDER_SUBJECT_UNIQUE,
        }),
      }),
    });

    // The whole unit of work must have rolled back: the user row created
    // earlier in the same transaction must not have survived either.
    const [persisted] = await db.select().from(users).where(eq(users.email, email));
    expect(persisted).toBeUndefined();
  });
});
