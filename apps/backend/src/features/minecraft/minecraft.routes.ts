// apps/backend/src/features/minecraft/minecraft.routes.ts

import { Router, type RequestHandler } from "express";
import type { MinecraftProfileController } from "./profiles/profiles.controller.js";
import { createMinecraftProfileRoutes } from "./profiles/profiles.routes.js";
import type { MinecraftServerController } from "./server/server.controller.js";
import { createMinecraftServerRoutes } from "./server/server.routes.js";

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
