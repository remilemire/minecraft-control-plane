// apps/backend/routes/index.ts
import { db } from "@/db/client.js";
import { AuthController } from "@/features/auth/auth.controller.js";
import { createRequireAuth } from "@/features/auth/auth.middleware.js";
import { createAuthRoutes } from "@/features/auth/auth.routes.js";
import { AuthService } from "@/features/auth/auth.service.js";
import { SessionRepository } from "@/features/sessions/session.repository.js";
import { SessionService } from "@/features/sessions/session.service.js";
import { UserController } from "@/features/users/user.controller.js";
import { UserRepository } from "@/features/users/user.repository.js";
import { createUserRoutes } from "@/features/users/user.routes.js";
import { UserService } from "@/features/users/user.service.js";
import { Router } from "express";
export const router = Router();
const users = new UserRepository(db);
const sessions = new SessionRepository(db);
const sessionService = new SessionService(sessions);
const userService = new UserService(users);
const authService = new AuthService(userService, sessionService);
const userController = new UserController(userService);
const authController = new AuthController(authService);
const requireAuth = createRequireAuth(authService);
router.use(createUserRoutes(userController, requireAuth));
router.use(createAuthRoutes(authController, requireAuth));
//# sourceMappingURL=index.js.map