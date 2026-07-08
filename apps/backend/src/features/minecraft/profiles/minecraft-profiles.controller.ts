// apps/backend/src/features/minecraft/profiles/minecraft-profiles.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import {
  createMinecraftProfileSchema,
  minecraftProfileResponseSchema,
  updateMinecraftProfileSchema,
  type MinecraftProfileResponse,
} from "@minecraft-server/shared/schemas";
import type { Request } from "express";
import type { MinecraftProfileService } from "./minecraft-profiles.service.js";

export class MinecraftProfileController {
  public constructor(private readonly minecraftProfileService: MinecraftProfileService) {}

  public async get(req: Request): Promise<MinecraftProfileResponse> {
    const user = getAuthenticatedUser(req);
    const minecraftProfile = await this.minecraftProfileService.getByUserId(user.id);
    return minecraftProfileResponseSchema.parse(minecraftProfile);
  }

  public async create(req: Request): Promise<MinecraftProfileResponse> {
    const input = createMinecraftProfileSchema.parse(req.body);
    const user = getAuthenticatedUser(req);

    const minecraftProfile = await this.minecraftProfileService.create({
      ...input,
      userId: user.id,
    });

    return minecraftProfileResponseSchema.parse(minecraftProfile);
  }

  public async changeUsername(req: Request): Promise<MinecraftProfileResponse> {
    const input = updateMinecraftProfileSchema.parse(req.body);
    const user = getAuthenticatedUser(req);

    const minecraftProfile = await this.minecraftProfileService.changeUsernameByUserId(
      user.id,
      input,
    );

    return minecraftProfileResponseSchema.parse(minecraftProfile);
  }
}
