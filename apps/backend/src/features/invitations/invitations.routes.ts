// apps/backend/src/features/invitations/invitations.routes.ts

import { requireAdmin } from "@/features/auth/auth.middleware.js";
import { requireCsrf } from "@/security/csrf.js";
import { Router, type RequestHandler } from "express";
import type { InvitationController } from "./invitations.controller.js";

export function createInvitationRoutes(
  invitationController: InvitationController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post("/invite", requireCsrf, requireAuth, requireAdmin, invitationController.invite);
  router.post("/delete", requireCsrf, requireAuth, requireAdmin, invitationController.delete);

  return router;
}
