// apps/backend/src/features/auth/auth.helpers.ts

import type { User } from "@/db/schema/index.js";
import type { Request } from "express";
import { UnauthenticatedError } from "./auth.errors.js";

export function getAuthenticatedUser(req: Request): User {
  if (req.user === undefined) {
    throw new UnauthenticatedError();
  }

  return req.user;
}
