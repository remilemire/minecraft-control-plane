// apps/backend/src/features/auth/auth.helpers.ts

import type { User } from "@/db/schema/users.js";
import { UnauthorizedError } from "@/errors/http-errors.js";
import type { Request } from "express";

export function getAuthenticatedUser(req: Request): User {
  if (req.user === undefined) {
    throw new UnauthorizedError();
  }

  return req.user;
}
