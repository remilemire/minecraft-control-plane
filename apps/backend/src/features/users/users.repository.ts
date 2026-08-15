// apps/backend/src/features/users/users.repository.ts

import { withDbErrors, type DatabaseProvider } from "@/infrastructure/db/index.js";
import { AppError } from "@/errors/app-error.js";
import { and, eq } from "drizzle-orm";
import { USERS_CONSTRAINTS } from "./users.constraints.js";
import { users, type NewUser, type User } from "./users.schema.js";

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

  public async findByEmail(email: string): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.databaseProvider.get().select().from(users).where(eq(users.email, email)).limit(1),
    );
    return user ?? null;
  }

  public async findOwner(): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.databaseProvider.get().select().from(users).where(eq(users.isOwner, true)).limit(1),
    );
    return user ?? null;
  }

  public async create(input: NewUser): Promise<User> {
    const [user] = await withDbErrors(
      () => this.databaseProvider.get().insert(users).values(input).returning(),
      {
        [USERS_CONSTRAINTS.EMAIL_UNIQUE]: "EMAIL_TAKEN",
        [USERS_CONSTRAINTS.SINGLE_OWNER_UNIQUE]: "OWNER_ALREADY_EXISTS",
      },
    );

    if (user === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to create user." });
    }

    return user;
  }

  // The is_owner predicate makes the demotion conditional: a null result means
  // the row wasn't the owner anymore, so a concurrent transfer already won.
  public async clearOwner(id: string): Promise<User | null> {
    const [user] = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .update(users)
        .set({ isOwner: false })
        .where(and(eq(users.id, id), eq(users.isOwner, true)))
        .returning(),
    );
    return user ?? null;
  }

  public async setOwner(id: string): Promise<User | null> {
    const [user] = await withDbErrors(
      () =>
        this.databaseProvider
          .get()
          .update(users)
          .set({ isOwner: true })
          .where(eq(users.id, id))
          .returning(),
      {
        [USERS_CONSTRAINTS.SINGLE_OWNER_UNIQUE]: "OWNER_ALREADY_EXISTS",
      },
    );
    return user ?? null;
  }
}
