// apps/backend/routes/index.ts

import { db } from "@/db/client.js";
import { AuthController } from "@/features/auth/auth.controller.js";
import { createRequireAuth } from "@/features/auth/auth.middleware.js";
import { createAuthRoutes } from "@/features/auth/auth.routes.js";
import { AuthService } from "@/features/auth/auth.service.js";
import { InvitationController } from "@/features/invitations/invitations.controller.js";
import { InvitationRepository } from "@/features/invitations/invitations.repository.js";
import { createInvitationRoutes } from "@/features/invitations/invitations.routes.js";
import { InvitationService } from "@/features/invitations/invitations.service.js";
import { SessionRepository } from "@/features/sessions/sessions.repository.js";
import { SessionService } from "@/features/sessions/sessions.service.js";
import { UserController } from "@/features/users/users.controller.js";
import { UserRepository } from "@/features/users/users.repository.js";
import { createUserRoutes } from "@/features/users/users.routes.js";
import { UserService } from "@/features/users/users.service.js";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";

export const router = Router();

const users = new UserRepository(db);
const sessions = new SessionRepository(db);
const invitations = new InvitationRepository(db);

const userService = new UserService(users);
const sessionService = new SessionService(sessions);
const invitationService = new InvitationService(invitations);

const googleOauthClient = new OAuth2Client();
const authService = new AuthService(
  userService,
  sessionService,
  invitationService,
  googleOauthClient,
);

const userController = new UserController(userService);
const invitationController = new InvitationController(invitationService);
const authController = new AuthController(authService);

const requireAuth = createRequireAuth(authService);

router.use(createUserRoutes(userController, requireAuth));
router.use(createInvitationRoutes(invitationController, requireAuth));
router.use(createAuthRoutes(authController, requireAuth));
