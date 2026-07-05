// apps/backend/src/features/invitations/invitations.routes.ts

import { Router, type RequestHandler } from "express";
import type { InvitationController } from "./invitations.controller.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { requireCsrf } from "@/security/csrf.middleware.js";

export function createInvitationRoutes(
  invitationController: InvitationController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post("/invite", requireCsrf, requireAuth, requireAdmin, invitationController.invite);
  router.post("/delete", requireCsrf, requireAuth, requireAdmin, invitationController.delete);

  return router;
}
