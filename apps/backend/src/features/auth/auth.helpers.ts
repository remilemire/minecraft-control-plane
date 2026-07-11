// apps/backend/src/features/auth/auth.helpers.ts

import type { User } from "@/db/schema/index.js";
import { AppError } from "@/errors/app-error.js";
import type { Request } from "express";

export function getAuthenticatedUser(req: Request): User {
  if (req.user === undefined) {
    throw new AppError("UNAUTHENTICATED");
  }

  return req.user;
}
