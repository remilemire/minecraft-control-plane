// apps/backend/src/features/invitations/invitations.routes.ts

import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import { Router, type RequestHandler } from "express";
import type { InvitationController } from "./invitations.controller.js";

export function createInvitationRoutes(
  invitationController: InvitationController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get("/", requireAuth, invitationController.list);
  router.post("/", requireAuth, requireCsrf, invitationController.invite);
  router.delete("/:invitationId", requireAuth, requireCsrf, invitationController.delete);

  return router;
}
