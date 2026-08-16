// apps/backend/src/features/minecraft/server/console/console.routes.ts

import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { MinecraftConsoleController } from "./console.controller.js";

export function createMinecraftConsoleRoutes(
  minecraftConsoleController: MinecraftConsoleController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/logs", requireAuth, minecraftConsoleController.streamLogs);
  router.post("/commands", requireAuth, requireCsrf, minecraftConsoleController.executeCommand);

  return router;
}
