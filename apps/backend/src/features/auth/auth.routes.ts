// apps/backend/src/features/auth/auth.routes.ts

import { requireCsrf } from "@/security/csrf.js";
import type { RequestHandler } from "express";
import { Router } from "express";
import type { AuthController } from "./auth.controller.js";

export function createAuthRoutes(
  authController: AuthController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post("/google", authController.googleLogin);
  router.post("/logout", requireCsrf, requireAuth, authController.logout);

  return router;
}
