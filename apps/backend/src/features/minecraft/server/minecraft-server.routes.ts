// apps/backend/src/features/minecraft/server/minecraft-server.routes.ts

import { Router, type RequestHandler } from "express";
import type { MinecraftServerController } from "./minecraft-server.controller.js";
import { requireCsrf } from "@/security/csrf.js";
import { requireAdmin } from "@/features/auth/auth.middleware.js";

export function createMinecraftServerRoutes(
  minecraftServerController: MinecraftServerController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get(
    "/server-status",
    requireAuth,
    requireAdmin,
    minecraftServerController.getServerStatus,
  );
  router.get("/list-players", requireAuth, requireAdmin, minecraftServerController.listPlayers);

  router.post(
    "/add-whitelist",
    requireCsrf,
    requireAuth,
    requireAdmin,
    minecraftServerController.addToWhitelist,
  );
  router.post(
    "/remove-whitelist",
    requireCsrf,
    requireAuth,
    requireAdmin,
    minecraftServerController.removeFromWhitelist,
  );
  router.post("/save-world", requireAuth, requireAdmin, minecraftServerController.saveWorld);
  router.post("/start-server", requireAuth, requireAdmin, minecraftServerController.startServer);
  router.post("/stop-server", requireAuth, requireAdmin, minecraftServerController.stopServer);
  router.post(
    "/restart-server",
    requireAuth,
    requireAdmin,
    minecraftServerController.restartServer,
  );

  return router;
}
