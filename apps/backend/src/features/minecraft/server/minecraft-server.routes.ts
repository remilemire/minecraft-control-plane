// apps/backend/src/features/minecraft/server/minecraft-server.routes.ts

import { requireAdmin } from "@/features/auth/auth.middleware.js";
import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { MinecraftServerController } from "./minecraft-server.controller.js";

export function createMinecraftServerRoutes(
  minecraftServerController: MinecraftServerController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/status", requireAuth, requireAdmin, minecraftServerController.getServerStatus);
  router.post(
    "/start",
    requireAuth,
    requireCsrf,
    requireAdmin,
    minecraftServerController.startServer,
  );
  router.post(
    "/stop",
    requireAuth,
    requireCsrf,
    requireAdmin,
    minecraftServerController.stopServer,
  );
  router.post(
    "/restart",
    requireAuth,
    requireCsrf,
    requireAdmin,
    minecraftServerController.restartServer,
  );

  return router;
}
