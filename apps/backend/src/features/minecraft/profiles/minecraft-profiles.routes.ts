// apps/backend/src/features/minecraft/profiles/minecraft-profiles.routes.ts

import { requireCsrf } from "@/security/csrf.js";
import { Router, type RequestHandler } from "express";
import type { MinecraftProfileController } from "./minecraft-profiles.controller.js";

export function createMinecraftProfileRoutes(
  minecraftProfileController: MinecraftProfileController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post("/get", requireAuth, minecraftProfileController.get);
  router.post("/create", requireCsrf, requireAuth, minecraftProfileController.create);
  router.post(
    "/change-username",
    requireCsrf,
    requireAuth,
    minecraftProfileController.changeUsername,
  );

  return router;
}
