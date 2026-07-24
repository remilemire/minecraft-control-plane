// apps/backend/src/features/minecraft/players/players.service.ts

import type { MinecraftProfile } from "@/infrastructure/db/schemas.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
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
    private readonly transactionManager: TransactionManager,
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
    // External calls stay outside the transaction: Mojang resolution happens
    // before it, the RCON whitelist call after it.
    const mojangProfile = await this.minecraftProfileService.resolveUsername(input.username);

    // The transaction spans a single write today, so it changes nothing yet;
    // it is the seam where the planned transactional outbox will enqueue the
    // whitelist command atomically with the profile write.
    const profile = await this.transactionManager.run(() =>
      this.minecraftProfileService.setByUserId(userId, mojangProfile),
    );
    await this.minecraftServerService.addToWhitelist(profile.username);

    return toPlayer(profile, []);
  }

  public async deleteByUserId(userId: string): Promise<MinecraftPlayer> {
    const profile = await this.minecraftProfileService.deleteByUserId(userId);
    await this.minecraftServerService.removeFromWhitelist(profile.username);

    return toPlayer(profile, []);
  }
}
