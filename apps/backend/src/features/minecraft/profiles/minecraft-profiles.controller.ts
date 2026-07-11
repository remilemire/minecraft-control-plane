// apps/backend/src/features/minecraft/profiles/minecraft-profiles.controller.ts

import { getAuthenticatedUser } from "@/features/auth/auth.helpers.js";
import { parseOrThrow } from "@/validation/parse.js";
import {
  minecraftProfileResponseSchema,
  updateMinecraftProfileSchema,
} from "@minecraft-server/shared/minecraft";
import type { Request, Response } from "express";
import type { MinecraftProfileService } from "./minecraft-profiles.service.js";

export class MinecraftProfileController {
  public constructor(private readonly minecraftProfileService: MinecraftProfileService) {}

  public list = async (_req: Request, res: Response): Promise<void> => {
    const minecraftProfiles = await this.minecraftProfileService.list();

    res
      .status(200)
      .json(minecraftProfiles.map((profile) => minecraftProfileResponseSchema.parse(profile)));
  };

  public get = async (req: Request, res: Response): Promise<void> => {
    const user = getAuthenticatedUser(req);
    const minecraftProfile = await this.minecraftProfileService.getByUserId(user.id);

    res.status(200).json(minecraftProfileResponseSchema.parse(minecraftProfile));
  };

  public set = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(updateMinecraftProfileSchema, req.body);
    const user = getAuthenticatedUser(req);

    const minecraftProfile = await this.minecraftProfileService.setByUserId(user.id, input);

    res.status(200).json(minecraftProfileResponseSchema.parse(minecraftProfile));
  };
}
