// backend/src/features/users/user.controller.ts

import type { User } from "@/db/schema/users.js";
import { UnauthorizedError } from "@/errors/http-errors.js";
import type { Request } from "express";
import type { UserService } from "./user.service.js";

export class UserController {
  public constructor(private readonly userService: UserService) {}

  public async getMe(req: Request): Promise<User> {
    if (req.user === undefined) {
      throw new UnauthorizedError();
    }
    return req.user;
  }
}
