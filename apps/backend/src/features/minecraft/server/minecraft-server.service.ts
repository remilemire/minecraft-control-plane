// apps/backend/src/features/minecraft/server/minecraft-server.service.ts

import type { ProcessClient } from "@/features/minecraft/clients/process.client.js";
import type { RconClient } from "@/features/minecraft/clients/rcon.client.js";
import type { MinecraftServerStatus } from "@/features/minecraft/server/minecraft-server.types.js";

export class MinecraftServerService {
  public constructor(
    private readonly rconClient: RconClient,
    private readonly processClient: ProcessClient,
  ) {}

  public async listPlayers(): Promise<string> {
    return this.rconClient.execute("list");
  }

  public async addToWhitelist(username: string): Promise<void> {
    await this.rconClient.execute(`whitelist add ${username}`);
  }

  public async removeFromWhitelist(username: string): Promise<void> {
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
