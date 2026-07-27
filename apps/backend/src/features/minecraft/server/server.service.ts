// apps/backend/src/features/minecraft/server/server.service.ts

import type { ProcessApi, RconApi } from "@/features/minecraft/minecraft.types.js";
import type { MinecraftServerStatus } from "@minecraft-control-plane/shared/minecraft";

// Vanilla's `list` command replies with a fixed sentence (itzg/minecraft-server
// runs vanilla, not Paper/Spigot, which word it differently), e.g.:
// "There are 2 of a max of 20 players online: Steve, Alex"
const LIST_OUTPUT_PATTERN = /^There are \d+ of a max of \d+ players online:\s*(?<names>.*)$/;

function parseOnlineUsernames(output: string): string[] {
  const names = LIST_OUTPUT_PATTERN.exec(output)?.groups?.names;
  if (names === undefined) {
    throw new Error(`Unexpected RCON \`list\` output: ${output}`);
  }

  return names === "" ? [] : names.split(",").map((name) => name.trim());
}

export class MinecraftServerService {
  public constructor(
    private readonly rconClient: RconApi,
    private readonly processClient: ProcessApi,
  ) {}

  public async listOnlineUsernames(): Promise<string[]> {
    const output = await this.rconClient.execute("list");
    return parseOnlineUsernames(output);
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
