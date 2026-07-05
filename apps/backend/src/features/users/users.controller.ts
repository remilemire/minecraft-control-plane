// apps/backend/src/features/users/users.controller.ts

import type { Request } from "express";
import { getAuthenticatedUser } from "../auth/auth.helpers.js";
import type { UserService } from "./users.service.js";
import { userResponseSchema, type UserResponse } from "@minecraft-server/shared/schemas";

export class UserController {
  public constructor(private readonly userService: UserService) {}

  public async getMe(req: Request): Promise<UserResponse> {
    const user = getAuthenticatedUser(req);

    return userResponseSchema.parse(user);
  }
}
