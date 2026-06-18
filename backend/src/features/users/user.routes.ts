// backend/src/features/users/user.routes.ts

import { Router, type RequestHandler } from "express";
import type { UserController } from "./user.controller.js";

export function createUserRoutes(
  userController: UserController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/me", requireAuth, userController.getMe);

  return router;
}
