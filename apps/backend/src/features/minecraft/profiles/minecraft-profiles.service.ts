// apps/backend/src/features/minecraft/profiles/minecraft-profiles.service.ts

import type { MinecraftProfile } from "@/db/schema/minecraft-profile.js";
import { AppError } from "@/errors/app-error.js";
import type { MojangApi, MojangProfile } from "@/features/minecraft/minecraft.types.js";
import type { SetMinecraftPlayerInput } from "@minecraft-server/shared/minecraft";
import { MinecraftProfileRepository } from "./minecraft-profiles.repository.js";

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

  // PUT semantics: creates the profile if the user has none, otherwise
  // replaces it. Resolving the username against Mojang first ensures we only
  // ever store a real account's uuid.
  public async setByUserId(
    userId: string,
    { username }: SetMinecraftPlayerInput,
  ): Promise<MinecraftProfile> {
    const mojangProfile = await this.getMojangProfile(username);
    return this.minecraftProfiles.upsertByUserId(userId, mojangProfile);
  }

  public async deleteByUserId(userId: string): Promise<MinecraftProfile> {
    const minecraftProfile = await this.minecraftProfiles.deleteByUserId(userId);

    if (minecraftProfile === null) {
      throw new AppError("MINECRAFT_PROFILE_NOT_FOUND");
    }

    return minecraftProfile;
  }

  private async getMojangProfile(username: string): Promise<MojangProfile> {
    const profile = await this.mojangClient.findByUsername(username);

    if (profile === null) {
      throw new AppError("MOJANG_PROFILE_NOT_FOUND");
    }

    return profile;
  }
}
