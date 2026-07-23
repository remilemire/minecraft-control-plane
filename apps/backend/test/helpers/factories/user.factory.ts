// apps/backend/test/helpers/factories/user.factory.ts

import { db } from "@/infrastructure/db/index.js";
import { users, type NewUser, type User } from "@/infrastructure/db/schema/index.js";

let sequence = 0;

export async function createUser(overrides: Partial<NewUser> = {}): Promise<User> {
  const n = ++sequence;

  const [user] = await db
    .insert(users)
    .values({
      email: `user${n}@example.com`,
      ...overrides,
    })
    .returning();

  if (user === undefined) {
    throw new Error("createUser: insert returned no row.");
  }

  return user;
}

export function createAdmin(overrides: Partial<NewUser> = {}): Promise<User> {
  return createUser({ isAdmin: true, ...overrides });
}
