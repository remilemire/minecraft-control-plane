// apps/backend/test/helpers/test-auth.ts

import type { NewUser, User } from "@/db/schema/index.js";
import { createSession } from "./factories/session.factory.js";
import { createUser } from "./factories/user.factory.js";
import { sessionCookie } from "./test-cookies.js";

export interface AuthenticatedUser {
  readonly user: User;
  readonly sessionToken: string;
  // Ready for supertest: .set("Cookie", [auth.cookie])
  readonly cookie: string;
}

export async function authenticateUser(
  overrides: Partial<NewUser> = {},
): Promise<AuthenticatedUser> {
  const user = await createUser(overrides);
  const { sessionToken } = await createSession({ userId: user.id });

  return { user, sessionToken, cookie: sessionCookie(sessionToken) };
}

export function authenticateAdmin(overrides: Partial<NewUser> = {}): Promise<AuthenticatedUser> {
  return authenticateUser({ isAdmin: true, ...overrides });
}
