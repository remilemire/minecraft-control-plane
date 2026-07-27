// apps/backend/src/features/users/users.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import { userResponseSchema } from "@minecraft-control-plane/shared/users";
import type { Request, Response } from "express";
import type { UserService } from "./users.service.js";

export class UserController {
  public constructor(private readonly userService: UserService) {}

  public list = async (_req: Request, res: Response): Promise<void> => {
    const users = await this.userService.list();

    res.status(200).json(users.map((user) => userResponseSchema.parse(user)));
  };

  public getMe = (req: Request, res: Response): void => {
    const user = getAuthenticatedUser(req);

    res.status(200).json(userResponseSchema.parse(user));
  };
}
