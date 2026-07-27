// apps/backend/src/features/minecraft/profiles/profiles.controller.ts

import { parseOrThrow } from "@/validation/parse.js";
import {
  createMinecraftProfileSchema,
  minecraftProfileIdSchema,
  minecraftProfileResponseSchema,
} from "@minecraft-control-plane/shared/minecraft";
import type { Request, Response } from "express";
import type { MinecraftProfileService } from "./profiles.service.js";

export class MinecraftProfileController {
  public constructor(private readonly minecraftProfileService: MinecraftProfileService) {}

  public list = async (_req: Request, res: Response): Promise<void> => {
    const profiles = await this.minecraftProfileService.list();

    res.status(200).json(profiles.map((profile) => minecraftProfileResponseSchema.parse(profile)));
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const input = parseOrThrow(createMinecraftProfileSchema, req.body);

    const profile = await this.minecraftProfileService.create(input);

    res.status(201).json(minecraftProfileResponseSchema.parse(profile));
  };

  public delete = async (req: Request, res: Response): Promise<void> => {
    const minecraftProfileId = parseOrThrow(
      minecraftProfileIdSchema,
      req.params.minecraftProfileId,
    );
    await this.minecraftProfileService.deleteById(minecraftProfileId);

    res.status(204).send();
  };
}
