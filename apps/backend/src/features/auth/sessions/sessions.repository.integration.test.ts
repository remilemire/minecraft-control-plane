// apps/backend/src/features/auth/sessions/sessions.repository.integration.test.ts

import { db } from "@/db/client.js";
import { DatabaseProvider } from "@/db/provider.js";
import { users } from "@/db/schema/index.js";
import { hashSecret } from "@/lib/tokens.js";
import { createSession } from "@test/helpers/factories/session.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SessionRepository } from "./sessions.repository.js";

describe("SessionRepository", () => {
  const repository = new SessionRepository(new DatabaseProvider(db));

  it("finds a session with its user by token hash", async () => {
    const user = await createUser();
    const { session, sessionToken } = await createSession({ userId: user.id });

    const result = await repository.findByTokenHashWithUser(hashSecret(sessionToken));

    expect(result?.session).toEqual(session);
    expect(result?.user).toEqual(user);
  });

  it("returns null for an unknown token hash", async () => {
    expect(await repository.findByTokenHashWithUser(hashSecret("nope"))).toBeNull();
  });

  it("deletes by token hash and returns the removed session", async () => {
    const { session, sessionToken } = await createSession();

    expect(await repository.deleteByTokenHash(hashSecret(sessionToken))).toEqual(session);
    expect(await repository.findByTokenHashWithUser(hashSecret(sessionToken))).toBeNull();
  });

  it("returns null when deleting an unknown token hash", async () => {
    expect(await repository.deleteByTokenHash(hashSecret("nope"))).toBeNull();
  });

  it("cascades session deletion when the user is deleted", async () => {
    const user = await createUser();
    const { sessionToken } = await createSession({ userId: user.id });

    await db.delete(users).where(eq(users.id, user.id));

    expect(await repository.findByTokenHashWithUser(hashSecret(sessionToken))).toBeNull();
  });
});
