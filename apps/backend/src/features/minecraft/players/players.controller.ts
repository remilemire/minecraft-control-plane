// apps/backend/src/features/minecraft/players/players.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import { parseOrThrow } from "@/validation/parse.js";
import {
  minecraftPlayerResponseSchema,
  setMinecraftPlayerSchema,
} from "@minecraft-server/shared/minecraft";
import { userIdSchema } from "@minecraft-server/shared/users";
import type { Request, Response } from "express";
import type { MinecraftPlayerService } from "./players.service.js";

export class MinecraftPlayerController {
  public constructor(private readonly minecraftPlayerService: MinecraftPlayerService) {}

  public list = async (_req: Request, res: Response): Promise<void> => {
    const players = await this.minecraftPlayerService.list();

    res.status(200).json(players.map((player) => minecraftPlayerResponseSchema.parse(player)));
  };

  public get = async (req: Request, res: Response): Promise<void> => {
    const user = getAuthenticatedUser(req);
    const player = await this.minecraftPlayerService.getByUserId(user.id);

    res.status(200).json(minecraftPlayerResponseSchema.parse(player));
  };

  public set = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(setMinecraftPlayerSchema, req.body);
    const user = getAuthenticatedUser(req);

    const player = await this.minecraftPlayerService.setByUserId(user.id, input);

    res.status(200).json(minecraftPlayerResponseSchema.parse(player));
  };

  public delete = async (req: Request, res: Response): Promise<void> => {
    const userId = parseOrThrow(userIdSchema, req.params.userId);
    await this.minecraftPlayerService.deleteByUserId(userId);

    res.status(204).send();
  };
}
