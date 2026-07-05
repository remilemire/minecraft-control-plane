// apps/backend/src/features/users/users.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import { userResponseSchema, type UserResponse } from "@minecraft-server/shared/schemas";
import type { Request } from "express";
import type { UserService } from "./users.service.js";

export class UserController {
  public constructor(private readonly userService: UserService) {}

  public async getMe(req: Request): Promise<UserResponse> {
    const user = getAuthenticatedUser(req);

    return userResponseSchema.parse(user);
  }
}
