// apps/backend/src/features/minecraft/server/minecraft-server.controller.ts

import { minecraftUsernameSchema } from "@minecraft-server/shared/schemas";
import type { Request } from "express";
import type { MinecraftServerService } from "./minecraft-server.service.js";
import type { MinecraftServerStatus } from "./minecraft-server.types.js";

export class MinecraftServerController {
  public constructor(private readonly minecraftServerService: MinecraftServerService) {}

  public async listPlayers(): Promise<string> {
    return this.minecraftServerService.listPlayers();
  }

  public async addToWhitelist(req: Request): Promise<void> {
    const username = minecraftUsernameSchema.parse(req.params);

    await this.minecraftServerService.addToWhitelist(username);
  }

  public async removeFromWhitelist(req: Request): Promise<void> {
    const username = minecraftUsernameSchema.parse(req.params);

    await this.minecraftServerService.removeFromWhitelist(username);
  }

  public async saveWorld(): Promise<void> {
    await this.minecraftServerService.saveWorld();
  }

  public async startServer(): Promise<void> {
    await this.minecraftServerService.start();
  }

  public async stopServer(): Promise<void> {
    await this.minecraftServerService.stop();
  }

  public async restartServer(): Promise<void> {
    await this.minecraftServerService.restart();
  }

  public async getServerStatus(): Promise<MinecraftServerStatus> {
    return await this.minecraftServerService.getStatus();
  }
}
