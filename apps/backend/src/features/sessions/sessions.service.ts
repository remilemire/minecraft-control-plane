// apps/backend/src/features/sessions/sessions.service.ts

import { env } from "@/config/env.js";
import type { Session } from "@/db/schema/index.js";
import { NotFoundError } from "@/errors/index.js";
import { generateRandomSecret, hashSecret } from "@/lib/crypto.js";
import type { SessionRepository } from "./sessions.repository.js";
import type { CreateSessionData, SessionWithToken, SessionWithUser } from "./sessions.types.js";

export class SessionService {
  public constructor(private readonly sessions: SessionRepository) {}

  public async findValidWithUser(sessionToken: string): Promise<SessionWithUser | null> {
    const result = await this.sessions.findByTokenHashWithUser(hashSecret(sessionToken));

    if (result === null || result.session.expiresAt < new Date()) {
      return null;
    }

    return result;
  }

  public async create(input: CreateSessionData): Promise<SessionWithToken> {
    const sessionToken = generateRandomSecret();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_MS);

    const session = await this.sessions.create({
      ...input,
      tokenHash: hashSecret(sessionToken),
      expiresAt: expiresAt,
    });

    return { session, sessionToken };
  }

  public async delete(sessionToken: string): Promise<Session> {
    const session = await this.sessions.deleteByTokenHash(hashSecret(sessionToken));

    if (session === null) {
      throw new NotFoundError("Session not found.");
    }

    return session;
  }
}
