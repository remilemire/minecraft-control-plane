// backend/src/features/sessions/session.repository.ts
import { sessions, users, } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";
export class SessionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findByTokenHashWithUser(tokenHash) {
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
    async create(input) {
        const [session] = await this.db.insert(sessions).values(input).returning();
        if (session === undefined) {
            throw new Error("Failed to create session");
        }
        return session;
    }
    async deleteByTokenHash(tokenHash) {
        const [session] = await this.db
            .delete(sessions)
            .where(eq(sessions.tokenHash, tokenHash))
            .returning();
        return session ?? null;
    }
}
//# sourceMappingURL=session.repository.js.map