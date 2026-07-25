// apps/backend/src/features/minecraft/players/players.service.ts

import type { MinecraftProfile } from "@/infrastructure/db/schemas.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
import type { AppOutboxService } from "@/infrastructure/outbox/outbox.registry.js";
import type { SetMinecraftPlayerInput } from "@minecraft-server/shared/minecraft";
import type { MinecraftProfileService } from "@/features/minecraft/profiles/profiles.service.js";
import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import { whitelistAddMessage, whitelistRemoveMessage } from "./players.outbox.js";
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
    private readonly outboxService: AppOutboxService,
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
  // enqueues the whitelist command atomically with the profile write; the
  // outbox dispatcher whitelists the player moments after the response.
  // A newly linked account can't already be online, so there's no need to
  // query RCON just to fill in `online`.
  public async setByUserId(
    userId: string,
    input: SetMinecraftPlayerInput,
  ): Promise<MinecraftPlayer> {
    // Mojang resolution is an external read and stays outside the transaction.
    const mojangProfile = await this.minecraftProfileService.resolveUsername(input.username);

    const profile = await this.transactionManager.run(async () => {
      // Read the row the upsert is about to replace: a rename leaves the old
      // username on the whitelist unless we enqueue its removal too.
      const previous = await this.minecraftProfileService.findByUserId(userId);
      const updated = await this.minecraftProfileService.setByUserId(userId, mojangProfile);

      if (previous !== null && previous.username !== updated.username) {
        await this.outboxService.enqueue(whitelistRemoveMessage.type, {
          userId: updated.userId,
          username: previous.username,
        });
      }

      await this.outboxService.enqueue(whitelistAddMessage.type, {
        userId: updated.userId,
        username: updated.username,
      });

      return updated;
    });

    return toPlayer(profile, []);
  }

  public async deleteByUserId(userId: string): Promise<MinecraftPlayer> {
    const profile = await this.transactionManager.run(async () => {
      const deleted = await this.minecraftProfileService.deleteByUserId(userId);
      await this.outboxService.enqueue(whitelistRemoveMessage.type, {
        userId: deleted.userId,
        username: deleted.username,
      });

      return deleted;
    });

    return toPlayer(profile, []);
  }
}
