// apps/backend/src/features/users/users.routes.ts

import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { UserController } from "./users.controller.js";

export function createUserRoutes(
  userController: UserController,
  requireAuth: RequestHandler,
  requireOwner: RequestHandler,
): Router {
  const router = Router();

  router.get("/", requireAuth, userController.list);
  router.get("/me", requireAuth, userController.getMe);
  router.post("/", requireAuth, requireCsrf, requireOwner, userController.create);
  router.post(
    "/:userId/transfer-ownership",
    requireAuth,
    requireCsrf,
    requireOwner,
    userController.transferOwnership,
  );

  return router;
}
