// apps/backend/src/features/minecraft/minecraft.routes.ts

import { Router, type RequestHandler } from "express";
import type { MinecraftProfileController } from "./profiles/profiles.controller.js";
import { createMinecraftProfileRoutes } from "./profiles/profiles.routes.js";

export function createMinecraftRoutes(
  minecraftProfileController: MinecraftProfileController,
  minecraftServerRouter: Router,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.use("/profiles", createMinecraftProfileRoutes(minecraftProfileController, requireAuth));
  router.use("/server", minecraftServerRouter);

  return router;
}
