// apps/backend/src/features/minecraft/players/players.service.ts

import type { MinecraftProfile } from "@/db/schema/index.js";
import type { SetMinecraftPlayerInput } from "@minecraft-server/shared/minecraft";
import type { MinecraftProfileService } from "@/features/minecraft/profiles/profiles.service.js";
import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import type { MinecraftPlayer } from "./players.types.js";

function toPlayer(profile: MinecraftProfile, onlineUsernames: readonly string[]): MinecraftPlayer {
  return {
    userId: profile.userId,
    username: profile.username,
    uuid: profile.uuid,
    online: onlineUsernames.includes(profile.username),
  };
}

export class MinecraftPlayerService {
  public constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftServerService: MinecraftServerService,
  ) {}

  public async list(): Promise<MinecraftPlayer[]> {
    const [profiles, onlineUsernames] = await Promise.all([
      this.minecraftProfileService.list(),
      this.minecraftServerService.listOnlineUsernames(),
    ]);

    return profiles.map((profile) => toPlayer(profile, onlineUsernames));
  }

  public async getByUserId(userId: string): Promise<MinecraftPlayer> {
    const [profile, onlineUsernames] = await Promise.all([
      this.minecraftProfileService.getByUserId(userId),
      this.minecraftServerService.listOnlineUsernames(),
    ]);

    return toPlayer(profile, onlineUsernames);
  }

  // Resolves the username against Mojang (via the profile service) and
  // whitelists it on the Minecraft server so the link takes effect immediately.
  // A newly linked account can't already be online, so there's no need to
  // query RCON a second time just to fill in `online`.
  public async setByUserId(
    userId: string,
    input: SetMinecraftPlayerInput,
  ): Promise<MinecraftPlayer> {
    const profile = await this.minecraftProfileService.setByUserId(userId, input);
    await this.minecraftServerService.addToWhitelist(profile.username);

    return toPlayer(profile, []);
  }

  public async deleteByUserId(userId: string): Promise<MinecraftPlayer> {
    const profile = await this.minecraftProfileService.deleteByUserId(userId);
    await this.minecraftServerService.removeFromWhitelist(profile.username);

    return toPlayer(profile, []);
  }
}
