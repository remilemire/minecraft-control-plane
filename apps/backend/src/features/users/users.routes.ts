// apps/backend/src/features/users/users.routes.ts

import { Router, type RequestHandler } from "express";
import type { UserController } from "./users.controller.js";

export function createUserRoutes(
  userController: UserController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/", requireAuth, userController.list);
  router.get("/me", requireAuth, userController.getMe);

  return router;
}
