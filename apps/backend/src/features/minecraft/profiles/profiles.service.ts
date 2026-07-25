// apps/backend/src/features/minecraft/profiles/profiles.service.ts

import { AppError } from "@/errors/app-error.js";
import type { MojangApi, MojangProfile } from "@/features/minecraft/minecraft.types.js";
import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
import type { AppOutboxService } from "@/infrastructure/outbox/outbox.registry.js";
import type { CreateMinecraftProfileInput } from "@minecraft-server/shared/minecraft";
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

  public async list(): Promise<MinecraftProfileWithStatus[]> {
    const [profiles, onlineUsernames] = await Promise.all([
      this.minecraftProfiles.findAll(),
      this.minecraftServerService.listOnlineUsernames(),
    ]);

    return profiles.map((profile) => withStatus(profile, onlineUsernames));
  }

  // Resolves the username against Mojang and enqueues the whitelist command
  // atomically with the insert; the outbox dispatcher whitelists the account
  // moments after the response. A just-added account can't already be online,
  // so there's no need to query RCON just to fill in `online`.
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
}
