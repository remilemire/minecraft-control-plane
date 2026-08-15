// apps/backend/src/features/users/users.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import { parseOrThrow } from "@/validation/parse.js";
import {
  createUserSchema,
  userIdSchema,
  userResponseSchema,
} from "@minecraft-control-plane/shared/users";
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

  public create = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(createUserSchema, req.body);

    const user = await this.userService.create(input);

    res.status(201).json(userResponseSchema.parse(user));
  };

  public transferOwnership = async (req: Request, res: Response): Promise<void> => {
    const targetUserId = parseOrThrow(userIdSchema, req.params.userId);
    const currentUser = getAuthenticatedUser(req);

    const newOwner = await this.userService.transferOwnership(currentUser.id, targetUserId);

    res.status(200).json(userResponseSchema.parse(newOwner));
  };
}
