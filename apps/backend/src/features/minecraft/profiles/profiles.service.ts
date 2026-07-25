// apps/backend/src/features/minecraft/profiles/profiles.service.ts

import type { MinecraftProfile } from "./profiles.schema.js";
import { AppError } from "@/errors/app-error.js";
import type { MojangApi, MojangProfile } from "@/features/minecraft/minecraft.types.js";
import { MinecraftProfileRepository } from "./profiles.repository.js";

export class MinecraftProfileService {
  public constructor(
    private readonly minecraftProfiles: MinecraftProfileRepository,
    private readonly mojangClient: MojangApi,
  ) {}

  public async list(): Promise<MinecraftProfile[]> {
    return this.minecraftProfiles.findAll();
  }

  public async getByUserId(userId: string): Promise<MinecraftProfile> {
    const minecraftProfile = await this.minecraftProfiles.findByUserId(userId);

    if (minecraftProfile === null) {
      throw new AppError("MINECRAFT_PROFILE_NOT_FOUND");
    }

    return minecraftProfile;
  }

  // Reconciliation-style lookups (null instead of NOT_FOUND) for callers that
  // check *current* state rather than assert it — the outbox handlers use
  // these to no-op on stale messages. HTTP paths keep the throwing
  // `getByUserId` semantics.
  public async findByUserId(userId: string): Promise<MinecraftProfile | null> {
    return this.minecraftProfiles.findByUserId(userId);
  }

  public async findByUsername(username: string): Promise<MinecraftProfile | null> {
    return this.minecraftProfiles.findByUsername(username);
  }

  // Resolves a username to its canonical Mojang profile (exact casing +
  // uuid). A separate step from `setByUserId` so callers can keep this HTTP
  // lookup outside a database transaction.
  public async resolveUsername(username: string): Promise<MojangProfile> {
    const profile = await this.mojangClient.findByUsername(username);

    if (profile === null) {
      throw new AppError("MOJANG_PROFILE_NOT_FOUND");
    }

    return profile;
  }

  // PUT semantics: creates the profile if the user has none, otherwise
  // replaces it. Takes a profile already resolved via `resolveUsername`, so
  // only a real account's uuid is ever stored.
  public async setByUserId(userId: string, profile: MojangProfile): Promise<MinecraftProfile> {
    return this.minecraftProfiles.upsertByUserId(userId, profile);
  }

  public async deleteByUserId(userId: string): Promise<MinecraftProfile> {
    const minecraftProfile = await this.minecraftProfiles.deleteByUserId(userId);

    if (minecraftProfile === null) {
      throw new AppError("MINECRAFT_PROFILE_NOT_FOUND");
    }

    return minecraftProfile;
  }
}
