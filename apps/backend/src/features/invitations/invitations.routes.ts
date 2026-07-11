// apps/backend/src/features/invitations/invitations.routes.ts

import { requireAdmin } from "@/features/auth/auth.middleware.js";
import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { InvitationController } from "./invitations.controller.js";

export function createInvitationRoutes(
  invitationController: InvitationController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/", requireAuth, requireAdmin, invitationController.list);
  router.post("/", requireAuth, requireCsrf, requireAdmin, invitationController.invite);
  router.delete(
    "/:invitationId",
    requireAuth,
    requireCsrf,
    requireAdmin,
    invitationController.delete,
  );

  return router;
}
