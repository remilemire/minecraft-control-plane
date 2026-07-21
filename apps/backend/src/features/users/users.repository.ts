// apps/backend/src/features/users/users.repository.ts

import { type Db } from "@/db/client.js";
import { USERS_CONSTRAINTS } from "@/db/constraints.js";
import type { Tx } from "@/db/transactions.js";
import { withDbErrors } from "@/db/errors.js";
import { users, type NewUser, type User } from "@/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import { eq } from "drizzle-orm";

export class UserRepository {
  public constructor(private readonly db: Db | Tx) {}

  public withTx(tx: Tx): UserRepository {
    return new UserRepository(tx);
  }

  public async findAll(): Promise<User[]> {
    return await withDbErrors(() => this.db.select().from(users).orderBy(users.createdAt));
  }

  public async findById(id: string): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.db.select().from(users).where(eq(users.id, id)).limit(1),
    );
    return user ?? null;
  }

  public async create(input: NewUser): Promise<User> {
    const [user] = await withDbErrors(() => this.db.insert(users).values(input).returning(), {
      [USERS_CONSTRAINTS.EMAIL_UNIQUE]: "EMAIL_TAKEN",
    });

    if (user === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create user." });
    }

    return user;
  }
}
