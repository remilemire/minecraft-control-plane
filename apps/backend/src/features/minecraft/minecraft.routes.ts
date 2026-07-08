// apps/backend/src/features/minecraft/minecraft.routes.ts

import { Router, type RequestHandler } from "express";
import type { MinecraftProfileController } from "./profiles/minecraft-profiles.controller.js";
import type { MinecraftServerController } from "./server/minecraft-server.controller.js";
import { createMinecraftProfileRoutes } from "./profiles/minecraft-profiles.routes.js";
import { createMinecraftServerRoutes } from "./server/minecraft-server.routes.js";

export function createMinecraftRoutes(
  minecraftProfileController: MinecraftProfileController,
  minecraftServerController: MinecraftServerController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.use("/profiles", createMinecraftProfileRoutes(minecraftProfileController, requireAuth));
  router.use("/server", createMinecraftServerRoutes(minecraftServerController, requireAuth));

  return router;
}
