// backend/src/features/sessions/session.service.ts

import { env } from "@/config/env.js";
import type { Session } from "@/db/schema/index.js";
import { generateRandomSecret, hashSecret } from "@/lib/crypto.js";
import type { SessionRepository } from "./session.repository.js";
import type { CreateSessionInput } from "./session.schemas.js";
import type {
  SessionToken,
  SessionTokenHash,
  SessionWithToken,
  SessionWithUser,
} from "./session.types.js";

function generateSessionToken(): SessionToken {
  return generateRandomSecret() as SessionToken;
}

function hashSessionToken(sessionToken: SessionToken): SessionTokenHash {
  return hashSecret(sessionToken) as SessionTokenHash;
}

export class SessionService {
  public constructor(private readonly sessions: SessionRepository) {}

  public async findValidByTokenWithUser(
    sessionToken: SessionToken,
  ): Promise<SessionWithUser | null> {
    const result = await this.sessions.findByTokenHashWithUser(
      hashSessionToken(sessionToken),
    );

    if (result === null) {
      return null;
    }

    if (result.session.expiresAt < new Date()) {
      return null;
    }

    return result;
  }

  public async create(input: CreateSessionInput): Promise<SessionWithToken> {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_MS);

    const session = await this.sessions.create({
      ...input,
      tokenHash: hashSecret(sessionToken),
      expiresAt: expiresAt,
    });

    return { session, sessionToken };
  }

  public async deleteByToken(
    sessionToken: SessionToken,
  ): Promise<Session | null> {
    return await this.sessions.deleteByTokenHash(
      hashSessionToken(sessionToken),
    );
  }
}
