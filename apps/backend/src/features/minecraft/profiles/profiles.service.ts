// apps/backend/src/features/minecraft/profiles/profiles.service.ts

import { AppError } from "@/errors/app-error.js";
import type { MojangApi, MojangProfile } from "@/features/minecraft/minecraft.types.js";
import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
import type { AppOutboxService } from "@/infrastructure/outbox/outbox.registry.js";
import type { CreateMinecraftProfileInput } from "@minecraft-control-plane/shared/minecraft";
import { whitelistAddMessage, whitelistRemoveMessage } from "./profiles.outbox.js";
import type { MinecraftProfileRepository } from "./profiles.repository.js";
import type { MinecraftProfile } from "./profiles.schema.js";
import type { MinecraftProfileWithStatus } from "./profiles.types.js";

function withStatus(
  profile: MinecraftProfile,
  onlineUsernames: readonly string[],
): MinecraftProfileWithStatus {
  return {
    id: profile.id,
    username: profile.username,
    uuid: profile.uuid,
    online: onlineUsernames.includes(profile.username),
    whitelistStatus: profile.whitelistStatus,
  };
}

export class MinecraftProfileService {
  public constructor(
    private readonly minecraftProfiles: MinecraftProfileRepository,
    private readonly mojangClient: MojangApi,
    private readonly minecraftServerService: MinecraftServerService,
    private readonly transactionManager: TransactionManager,
    private readonly outboxService: AppOutboxService,
  ) {}

  // Online status is enrichment over rows that live in Postgres, so an
  // unreachable server costs the badge, not the list: RCON is down for the
  // minutes the Minecraft server takes to boot, and letting that through would
  // 503 a whitelist we can read perfectly well. Everyone reads offline until
  // RCON answers again — which is also the truth while the server is starting.
  public async list(): Promise<MinecraftProfileWithStatus[]> {
    const [profiles, onlineUsernames] = await Promise.all([
      this.minecraftProfiles.findAll(),
      this.listOnlineUsernamesOrNone(),
    ]);

    return profiles.map((profile) => withStatus(profile, onlineUsernames));
  }

  // Swallowing the failure costs us the error handler's 5xx log, so this is
  // the only trace left that the status came back degraded.
  private async listOnlineUsernamesOrNone(): Promise<string[]> {
    try {
      return await this.minecraftServerService.listOnlineUsernames();
    } catch (error) {
      console.warn("Online status unavailable; reporting every profile offline:", error);
      return [];
    }
  }

  // Resolves the username against Mojang and enqueues the whitelist command
  // atomically with the insert; the outbox dispatcher whitelists the account
  // moments after the response. The row is created `pending` (the column's
  // default) and the dispatcher settles it. A just-added account can't already
  // be online, so there's no need to query RCON just to fill in `online`.
  public async create(input: CreateMinecraftProfileInput): Promise<MinecraftProfileWithStatus> {
    // Mojang resolution is an external read and stays outside the transaction.
    const mojangProfile = await this.resolveUsername(input.username);

    const profile = await this.transactionManager.run(async () => {
      const created = await this.minecraftProfiles.create(mojangProfile);
      await this.outboxService.enqueue(whitelistAddMessage.type, {
        minecraftProfileId: created.id,
        username: created.username,
      });

      return created;
    });

    return withStatus(profile, []);
  }

  public async deleteById(minecraftProfileId: string): Promise<void> {
    await this.transactionManager.run(async () => {
      const deleted = await this.minecraftProfiles.deleteById(minecraftProfileId);

      // Thrown inside the transaction, so nothing is ever enqueued for a
      // profile that wasn't actually removed.
      if (deleted === null) {
        throw new AppError("MINECRAFT_PROFILE_NOT_FOUND");
      }

      await this.outboxService.enqueue(whitelistRemoveMessage.type, {
        minecraftProfileId: deleted.id,
        username: deleted.username,
      });
    });
  }

  // Resolves a username to its canonical Mojang profile (exact casing +
  // uuid). A separate step from `create` so the HTTP lookup stays outside the
  // database transaction.
  public async resolveUsername(username: string): Promise<MojangProfile> {
    const profile = await this.mojangClient.findByUsername(username);

    if (profile === null) {
      throw new AppError("MOJANG_PROFILE_NOT_FOUND");
    }

    return profile;
  }

  // Reconciliation-style lookups (null instead of NOT_FOUND) for callers that
  // check *current* state rather than assert it — the outbox handlers use
  // these to no-op on stale messages.
  public async findById(id: string): Promise<MinecraftProfile | null> {
    return this.minecraftProfiles.findById(id);
  }

  public async findByUsername(username: string): Promise<MinecraftProfile | null> {
    return this.minecraftProfiles.findByUsername(username);
  }

  // Whitelist outcomes, recorded by the outbox handler: `whitelisted` once RCON
  // accepted the command, `failed` only when the message dead-lettered (a
  // profile with attempts left stays pending). Both are last-writer-wins on the
  // current row and no-op when the profile is already gone, so a retried or
  // out-of-order message can't resurrect state.
  public async markWhitelisted(minecraftProfileId: string): Promise<void> {
    await this.minecraftProfiles.updateWhitelistStatus(minecraftProfileId, "whitelisted");
  }

  public async markWhitelistFailed(minecraftProfileId: string): Promise<void> {
    await this.minecraftProfiles.updateWhitelistStatus(minecraftProfileId, "failed");
  }
}
