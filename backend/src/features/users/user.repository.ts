// backend/src/features/users/user.repository.ts

import type { Db } from "@/db/client.js";
import { users, type NewUser, type User } from "@/db/schema/users.js";
import { eq } from "drizzle-orm";

export class UserRepository {
  public constructor(private readonly db: Db) {}

  public async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user ?? null;
  }

  public async create(input: NewUser): Promise<User> {
    const [user] = await this.db.insert(users).values(input).returning();

    if (user === undefined) {
      throw new Error("Failed to create user.");
    }

    return user;
  }
}
