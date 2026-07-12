// apps/backend/src/features/sessions/session.service.ts
import { env } from "../../config/env.js";
import { generateRandomSecret, hashSecret } from "../../lib/crypto.js";
function generateSessionToken() {
  return generateRandomSecret();
}
function hashSessionToken(sessionToken) {
  return hashSecret(sessionToken);
}
export class SessionService {
  sessions;
  constructor(sessions) {
    this.sessions = sessions;
  }
  async findValidByTokenWithUser(sessionToken) {
    const result = await this.sessions.findByTokenHashWithUser(hashSessionToken(sessionToken));
    if (result === null) {
      return null;
    }
    if (result.session.expiresAt < new Date()) {
      return null;
    }
    return result;
  }
  async create(input) {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_MS);
    const session = await this.sessions.create({
      ...input,
      tokenHash: hashSecret(sessionToken),
      expiresAt: expiresAt,
    });
    return { session, sessionToken };
  }
  async deleteByToken(sessionToken) {
    return await this.sessions.deleteByTokenHash(hashSessionToken(sessionToken));
  }
}
//# sourceMappingURL=session.service.js.map
