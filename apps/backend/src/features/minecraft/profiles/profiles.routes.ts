// apps/backend/src/features/minecraft/profiles/profiles.routes.ts

import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { MinecraftProfileController } from "./profiles.controller.js";

export function createMinecraftProfileRoutes(
  minecraftProfileController: MinecraftProfileController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/", requireAuth, minecraftProfileController.list);
  router.post("/", requireAuth, requireCsrf, minecraftProfileController.create);
  router.delete(
    "/:minecraftProfileId",
    requireAuth,
    requireCsrf,
    minecraftProfileController.delete,
  );

  return router;
}
