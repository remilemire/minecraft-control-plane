// apps/backend/src/features/minecraft/server/server.controller.ts

import { minecraftServerStatusResponseSchema } from "@minecraft-control-plane/shared/minecraft";
import type { Request, Response } from "express";
import type { MinecraftServerService } from "./server.service.js";

export class MinecraftServerController {
  public constructor(private readonly minecraftServerService: MinecraftServerService) {}

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
