// apps/backend/src/features/users/users.repository.ts

import { USERS_CONSTRAINTS } from "@/infrastructure/db/constraints.js";
import { withDbErrors } from "@/infrastructure/db/errors.js";
import type { DatabaseProvider } from "@/infrastructure/db/provider.js";
import { users, type NewUser, type User } from "@/infrastructure/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import { eq } from "drizzle-orm";

export class UserRepository {
  public constructor(private readonly databaseProvider: DatabaseProvider) {}

  public async findAll(): Promise<User[]> {
    return await withDbErrors(() =>
      this.databaseProvider.get().select().from(users).orderBy(users.createdAt),
    );
  }

  public async findById(id: string): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.databaseProvider.get().select().from(users).where(eq(users.id, id)).limit(1),
    );
    return user ?? null;
  }

  public async create(input: NewUser): Promise<User> {
    const [user] = await withDbErrors(
      () => this.databaseProvider.get().insert(users).values(input).returning(),
      {
        [USERS_CONSTRAINTS.EMAIL_UNIQUE]: "EMAIL_TAKEN",
      },
    );

    if (user === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create user." });
    }

    return user;
  }
}
