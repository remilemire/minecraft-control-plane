// apps/backend/src/features/minecraft/profiles/minecraft-profiles.routes.ts

import { requireAdmin } from "@/features/auth/auth.middleware.js";
import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { MinecraftProfileController } from "./minecraft-profiles.controller.js";

export function createMinecraftProfileRoutes(
  minecraftProfileController: MinecraftProfileController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/", requireAuth, requireAdmin, minecraftProfileController.list);
  router.get("/me", requireAuth, minecraftProfileController.get);
  router.put("/me", requireAuth, requireCsrf, minecraftProfileController.set);

  return router;
}
