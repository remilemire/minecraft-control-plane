// apps/backend/src/features/auth/sessions/sessions.service.ts

import { env } from "@/config/env.js";
import type { Session } from "@/infrastructure/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import { generateRandomSecret, hashSecret } from "@/lib/tokens.js";
import type { SessionRepository } from "./sessions.repository.js";
import type { CreateSessionData, SessionWithToken, SessionWithUser } from "./sessions.types.js";

export class SessionService {
  public constructor(private readonly sessions: SessionRepository) {}

  public async findValidWithUser(token: string): Promise<SessionWithUser | null> {
    const result = await this.sessions.findByTokenHashWithUser(hashSecret(token));

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

  public async delete(token: string): Promise<Session> {
    const session = await this.sessions.deleteByTokenHash(hashSecret(token));

    if (session === null) {
      throw new AppError("SESSION_NOT_FOUND");
    }

    return session;
  }
}
