// apps/backend/src/features/users/users.repository.ts

import { type Db } from "@/db/client.js";
import { USERS_CONSTRAINTS } from "@/db/constraints.js";
import { withDbErrors } from "@/db/errors.js";
import { users, type NewUser, type User } from "@/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import { eq } from "drizzle-orm";

export class UserRepository {
  public constructor(private readonly db: Db) {}

  public async findById(id: string): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.db.select().from(users).where(eq(users.id, id)).limit(1),
    );
    return user ?? null;
  }

  public async findByGoogleId(googleId: string): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.db.select().from(users).where(eq(users.googleId, googleId)).limit(1),
    );
    return user ?? null;
  }

  public async create(input: NewUser): Promise<User> {
    const [user] = await withDbErrors(() => this.db.insert(users).values(input).returning(), {
      [USERS_CONSTRAINTS.GOOGLE_ID_UNIQUE]: "GOOGLE_ID_TAKEN",
      [USERS_CONSTRAINTS.EMAIL_UNIQUE]: "EMAIL_TAKEN",
    });

    if (user === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create user." });
    }

    return user;
  }
}
