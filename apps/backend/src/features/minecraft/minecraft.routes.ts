// apps/backend/src/features/minecraft/minecraft.routes.ts

import { Router, type RequestHandler } from "express";
import type { MinecraftPlayerController } from "./players/minecraft-players.controller.js";
import { createMinecraftPlayerRoutes } from "./players/minecraft-players.routes.js";
import type { MinecraftServerController } from "./server/minecraft-server.controller.js";
import { createMinecraftServerRoutes } from "./server/minecraft-server.routes.js";

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
