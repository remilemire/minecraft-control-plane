// apps/backend/src/features/users/user.repository.ts
import { users } from "@/db/schema/users.js";
import { eq } from "drizzle-orm";
export class UserRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  async findByEmail(email) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }
  async create(input) {
    const [user] = await this.db.insert(users).values(input).returning();
    if (user === undefined) {
      throw new Error("Failed to create user.");
    }
    return user;
  }
}
//# sourceMappingURL=user.repository.js.map
