// apps/backend/src/features/minecraft/players/players.routes.ts

import { requireAdmin } from "@/features/auth/auth.middleware.js";
import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { MinecraftPlayerController } from "./players.controller.js";

export function createMinecraftPlayerRoutes(
  minecraftPlayerController: MinecraftPlayerController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/", requireAuth, requireAdmin, minecraftPlayerController.list);
  router.get("/me", requireAuth, minecraftPlayerController.get);
  router.put("/me", requireAuth, requireCsrf, minecraftPlayerController.set);
  router.delete(
    "/:userId",
    requireAuth,
    requireCsrf,
    requireAdmin,
    minecraftPlayerController.delete,
  );

  return router;
}
