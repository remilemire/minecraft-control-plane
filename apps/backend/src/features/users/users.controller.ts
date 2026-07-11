// apps/backend/src/features/users/users.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import { userResponseSchema } from "@minecraft-server/shared/users";
import type { Request, Response } from "express";
import type { UserService } from "./users.service.js";

export class UserController {
  public constructor(private readonly userService: UserService) {}

  public getMe = (req: Request, res: Response): void => {
    const user = getAuthenticatedUser(req);

    res.status(200).json(userResponseSchema.parse(user));
  };
}
