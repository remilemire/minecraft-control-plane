// apps/backend/src/features/auth/sessions/sessions.repository.ts

import { withDbErrors, type DatabaseProvider } from "@/infrastructure/db/index.js";
import { users } from "@/infrastructure/db/schemas.js";
import { AppError } from "@/errors/app-error.js";
import { eq } from "drizzle-orm";
import { sessions, type NewSession, type Session } from "./sessions.schema.js";
import type { SessionWithUser } from "./sessions.types.js";

export class SessionRepository {
  public constructor(private readonly databaseProvider: DatabaseProvider) {}

  public async findByTokenHashWithUser(tokenHash: string): Promise<SessionWithUser | null> {
    const [row] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .select()
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1),
    );
    return row !== undefined ? { session: row.sessions, user: row.users } : null;
  }

  public async create(input: NewSession): Promise<Session> {
    const [session] = await withDbErrors(() =>
      this.databaseProvider.get().insert(sessions).values(input).returning(),
    );

    if (session === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create session." });
    }

    return session;
  }

  public async deleteByTokenHash(tokenHash: string): Promise<Session | null> {
    const [session] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .delete(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .returning(),
    );
    return session ?? null;
  }
}
