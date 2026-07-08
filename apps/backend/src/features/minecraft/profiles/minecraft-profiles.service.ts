// apps/backend/src/features/minecraft/profiles/minecraft-profiles.service.ts

import type { MinecraftProfile } from "@/db/schema/minecraft-profile.js";
import { NotFoundError } from "@/errors/http-errors.js";
import type { MojangClient, MojangProfile } from "@/features/minecraft/clients/mojang.client.js";
import type { UpdateMinecraftProfileInput } from "@minecraft-server/shared/schemas";
import { MinecraftProfileRepository } from "./minecraft-profiles.repository.js";
import type { CreateMinecraftProfileData } from "./minecraft-profiles.types.js";

export class MinecraftProfileService {
  public constructor(
    private readonly minecraftProfiles: MinecraftProfileRepository,
    private readonly mojangClient: MojangClient,
  ) {}

  public async getByUserId(userId: string): Promise<MinecraftProfile> {
    const minecraftProfile = await this.minecraftProfiles.findByUserId(userId);

    if (minecraftProfile === null) {
      throw new NotFoundError("Minecraft profile not found.");
    }

    return minecraftProfile;
  }

  public async create({
    username,
    ...rest
  }: CreateMinecraftProfileData): Promise<MinecraftProfile> {
    const mojangProfile = await this.getMojangProfile(username);
    const minecraftProfile = await this.minecraftProfiles.create({ ...mojangProfile, ...rest });
    return minecraftProfile;
  }

  public async changeUsernameByUserId(
    userId: string,
    { username }: UpdateMinecraftProfileInput,
  ): Promise<MinecraftProfile> {
    const mojangProfile = await this.getMojangProfile(username);
    const minecraftProfile = await this.minecraftProfiles.updateByUserId(userId, mojangProfile);

    if (minecraftProfile === null) {
      throw new NotFoundError("Minecraft profile not found.");
    }

    return minecraftProfile;
  }

  public async deleteByUserId(userId: string): Promise<MinecraftProfile> {
    const minecraftProfile = await this.minecraftProfiles.deleteByUserId(userId);

    if (minecraftProfile === null) {
      throw new NotFoundError("Minecraft profile not found.");
    }

    return minecraftProfile;
  }

  private async getMojangProfile(username: string): Promise<MojangProfile> {
    const profile = await this.mojangClient.findByUsername(username);

    if (profile === null) {
      throw new NotFoundError("Mojang profile not found.");
    }

    return profile;
  }
}
