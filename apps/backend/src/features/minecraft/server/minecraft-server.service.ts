// apps/backend/src/features/minecraft/server/minecraft-server.service.ts

import type { ProcessApi, RconApi } from "@/features/minecraft/minecraft.types.js";
import type {
  MinecraftServerPlayersResponse,
  MinecraftServerStatus,
} from "@minecraft-server/shared/minecraft";
import type { MinecraftProfileService } from "../profiles/minecraft-profiles.service.js";

// Vanilla's `list` command replies with a fixed sentence (itzg/minecraft-server
// runs vanilla, not Paper/Spigot, which word it differently), e.g.:
// "There are 2 of a max of 20 players online: Steve, Alex"
const LIST_OUTPUT_PATTERN =
  /^There are (?<online>\d+) of a max of (?<maximum>\d+) players online:\s*(?<names>.*)$/;

function parseListOutput(output: string): MinecraftServerPlayersResponse {
  const groups = LIST_OUTPUT_PATTERN.exec(output)?.groups;
  if (groups === undefined) {
    throw new Error(`Unexpected RCON \`list\` output: ${output}`);
  }

  const { online, maximum, names } = groups as Record<"online" | "maximum" | "names", string>;
  return {
    online: Number(online),
    maximum: Number(maximum),
    players: names === "" ? [] : names.split(",").map((name) => name.trim()),
  };
}

export class MinecraftServerService {
  public constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly rconClient: RconApi,
    private readonly processClient: ProcessApi,
  ) {}

  public async listPlayers(): Promise<MinecraftServerPlayersResponse> {
    const output = await this.rconClient.execute("list");
    return parseListOutput(output);
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
