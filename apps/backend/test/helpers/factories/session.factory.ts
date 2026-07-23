// apps/backend/test/helpers/factories/session.factory.ts

import { db } from "@/infrastructure/db/client.js";
import { sessions, type NewSession, type Session } from "@/infrastructure/db/schema/index.js";
import { generateRandomSecret, hashSecret } from "@/lib/tokens.js";
import { createUser } from "./user.factory.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface CreatedSession {
  readonly session: Session;
  // The raw token as the browser would hold it; only its hash is stored.
  readonly sessionToken: string;
}

export async function createSession(overrides: Partial<NewSession> = {}): Promise<CreatedSession> {
  const sessionToken = generateRandomSecret();
  const userId = overrides.userId ?? (await createUser()).id;

  const [session] = await db
    .insert(sessions)
    .values({
      tokenHash: hashSecret(sessionToken),
      expiresAt: new Date(Date.now() + ONE_HOUR_MS),
      ...overrides,
      userId,
    })
    .returning();

  if (session === undefined) {
    throw new Error("createSession: insert returned no row.");
  }

  return { session, sessionToken };
}
