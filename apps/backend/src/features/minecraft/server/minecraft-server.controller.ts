// apps/backend/src/features/minecraft/server/minecraft-server.controller.ts

import { parseOrThrow } from "@/validation/parse.js";
import {
  minecraftServerPlayersResponseSchema,
  minecraftServerStatusResponseSchema,
} from "@minecraft-server/shared/minecraft";
import { userIdSchema } from "@minecraft-server/shared/users";
import type { Request, Response } from "express";
import type { MinecraftServerService } from "./minecraft-server.service.js";

export class MinecraftServerController {
  public constructor(private readonly minecraftServerService: MinecraftServerService) {}

  public listPlayers = async (_req: Request, res: Response): Promise<void> => {
    const players = await this.minecraftServerService.listPlayers();

    res.status(200).json(minecraftServerPlayersResponseSchema.parse(players));
  };

  public addToWhitelist = async (req: Request, res: Response): Promise<void> => {
    const userId = parseOrThrow(userIdSchema, req.params.userId);

    await this.minecraftServerService.addToWhitelist(userId);

    res.status(204).send();
  };

  public removeFromWhitelist = async (req: Request, res: Response): Promise<void> => {
    const userId = parseOrThrow(userIdSchema, req.params.userId);

    await this.minecraftServerService.removeFromWhitelist(userId);

    res.status(204).send();
  };

  public startServer = async (_req: Request, res: Response): Promise<void> => {
    await this.minecraftServerService.start();

    res.status(204).send();
  };

  public stopServer = async (_req: Request, res: Response): Promise<void> => {
    await this.minecraftServerService.stop();

    res.status(204).send();
  };

  public restartServer = async (_req: Request, res: Response): Promise<void> => {
    await this.minecraftServerService.restart();

    res.status(204).send();
  };

  public getServerStatus = async (_req: Request, res: Response): Promise<void> => {
    const status = await this.minecraftServerService.getStatus();

    res.status(200).json(minecraftServerStatusResponseSchema.parse({ status }));
  };
}
