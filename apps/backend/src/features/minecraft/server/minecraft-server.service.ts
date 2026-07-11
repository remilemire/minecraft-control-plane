// apps/backend/src/features/minecraft/server/minecraft-server.service.ts

import type { ProcessApi, RconApi } from "@/features/minecraft/minecraft.types.js";
import type { MinecraftServerStatus } from "@minecraft-server/shared/minecraft";
import type { MinecraftProfileService } from "../profiles/minecraft-profiles.service.js";

export class MinecraftServerService {
  public constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly rconClient: RconApi,
    private readonly processClient: ProcessApi,
  ) {}

  public async listPlayers(): Promise<string> {
    return this.rconClient.execute("list");
  }

  public async addToWhitelist(userId: string): Promise<void> {
    const { username } = await this.minecraftProfileService.getByUserId(userId);

    await this.rconClient.execute(`whitelist add ${username}`);
  }

  public async removeFromWhitelist(userId: string): Promise<void> {
    const { username } = await this.minecraftProfileService.getByUserId(userId);

    await this.rconClient.execute(`whitelist remove ${username}`);
  }

  public async saveWorld(): Promise<void> {
    await this.rconClient.execute("save-all flush");
  }

  public async start(): Promise<void> {
    await this.processClient.start();
  }

  public async stop(): Promise<void> {
    await this.processClient.stop();
  }

  public async restart(): Promise<void> {
    await this.processClient.restart();
  }

  public async getStatus(): Promise<MinecraftServerStatus> {
    return await this.processClient.getStatus();
  }
}
