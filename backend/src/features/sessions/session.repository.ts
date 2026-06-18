// backend/src/features/sessions/session.repository.ts

import type { Db } from "@/db/client.js";
import {
  sessions,
  users,
  type NewSession,
  type Session,
} from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
import type { SessionTokenHash, SessionWithUser } from "./session.types.js";

export class SessionRepository {
  public constructor(private readonly db: Db) {}

  public async findByTokenHashWithUser(
    tokenHash: SessionTokenHash,
  ): Promise<SessionWithUser | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);

    return row !== undefined
      ? { session: row.sessions, user: row.users }
      : null;
  }

  public async create(input: NewSession): Promise<Session> {
    const [session] = await this.db.insert(sessions).values(input).returning();

    if (session === undefined) {
      throw new Error("Failed to create session");
    }

    return session;
  }

  public async deleteByTokenHash(
    tokenHash: SessionTokenHash,
  ): Promise<Session | null> {
    const [session] = await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .returning();

    return session ?? null;
  }
}
