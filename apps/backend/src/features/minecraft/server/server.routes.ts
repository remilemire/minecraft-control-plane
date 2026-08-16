// apps/backend/src/features/minecraft/server/server.routes.ts

import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { MinecraftConsoleController } from "./console/console.controller.js";
import { createMinecraftConsoleRoutes } from "./console/console.routes.js";
import type { MinecraftServerController } from "./server.controller.js";

export function createMinecraftServerRoutes(
  minecraftConsoleController: MinecraftConsoleController,
  minecraftServerController: MinecraftServerController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.use("/console", createMinecraftConsoleRoutes(minecraftConsoleController, requireAuth));
  router.get("/status", requireAuth, minecraftServerController.getServerStatus);
  router.post("/start", requireAuth, requireCsrf, minecraftServerController.startServer);
  router.post("/stop", requireAuth, requireCsrf, minecraftServerController.stopServer);
  router.post("/restart", requireAuth, requireCsrf, minecraftServerController.restartServer);

  return router;
}
