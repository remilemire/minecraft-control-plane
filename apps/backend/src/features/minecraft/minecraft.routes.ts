// apps/backend/src/features/minecraft/minecraft.routes.ts

import { Router, type RequestHandler } from "express";
import type { MinecraftPlayerController } from "./players/players.controller.js";
import { createMinecraftPlayerRoutes } from "./players/players.routes.js";
import type { MinecraftServerController } from "./server/server.controller.js";
import { createMinecraftServerRoutes } from "./server/server.routes.js";

export function createMinecraftRoutes(
  minecraftPlayerController: MinecraftPlayerController,
  minecraftServerController: MinecraftServerController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.use("/players", createMinecraftPlayerRoutes(minecraftPlayerController, requireAuth));
  router.use("/server", createMinecraftServerRoutes(minecraftServerController, requireAuth));

  return router;
}
