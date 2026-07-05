// apps/backend/src/features/users/users.repository.ts

import { type Db } from "@/db/client.js";
import { DbError, withDbErrors } from "@/db/errors.js";
import { users, type NewUser, type User } from "@/db/schema/users.js";
import { eq } from "drizzle-orm";

export class UserRepository {
  public constructor(private readonly db: Db) {}

  public async findByGoogleId(googleId: string): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.db.select().from(users).where(eq(users.googleId, googleId)).limit(1),
    );
    return user ?? null;
  }

  public async create(input: NewUser): Promise<User> {
    const [user] = await withDbErrors(() => this.db.insert(users).values(input).returning());

    if (user === undefined) {
      throw new DbError("Failed to create user.");
    }

    return user;
  }
}
