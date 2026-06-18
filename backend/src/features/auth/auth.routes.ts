// backend/src/features/auth/auth.routes.ts

import { Router } from "express";
import type { RequestHandler } from "express-serve-static-core";
import type { AuthController } from "./auth.controller.js";

export function createAuthRoutes(
  authController: AuthController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post("/login", authController.login);
  router.post("/register", authController.register);
  router.post("/logout", requireAuth, authController.logout);

  return router;
}
