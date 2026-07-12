// apps/backend/routes/index.ts
import { AuthController } from "../features/auth/auth.controller.js";
import { createRequireAuth } from "../features/auth/auth.middleware.js";
import { createAuthRoutes } from "../features/auth/auth.routes.js";
import { AuthService } from "../features/auth/auth.service.js";
import { InvitationController } from "../features/invitations/invitations.controller.js";
import { InvitationRepository } from "../features/invitations/invitations.repository.js";
import { createInvitationRoutes } from "../features/invitations/invitations.routes.js";
import { InvitationService } from "../features/invitations/invitations.service.js";
import { createMinecraftRoutes } from "../features/minecraft/minecraft.routes.js";
import { MinecraftProfileController } from "../features/minecraft/profiles/minecraft-profiles.controller.js";
import { MinecraftProfileRepository } from "../features/minecraft/profiles/minecraft-profiles.repository.js";
import { MinecraftProfileService } from "../features/minecraft/profiles/minecraft-profiles.service.js";
import { MinecraftServerController } from "../features/minecraft/server/minecraft-server.controller.js";
import { MinecraftServerService } from "../features/minecraft/server/minecraft-server.service.js";
import { SessionRepository } from "../features/sessions/sessions.repository.js";
import { SessionService } from "../features/sessions/sessions.service.js";
import { UserController } from "../features/users/users.controller.js";
import { UserRepository } from "../features/users/users.repository.js";
import { createUserRoutes } from "../features/users/users.routes.js";
import { UserService } from "../features/users/users.service.js";
import { Router } from "express";
export function createRouter(deps) {
    const router = Router();
    const users = new UserRepository(deps.db);
    const sessions = new SessionRepository(deps.db);
    const invitations = new InvitationRepository(deps.db);
    const minecraftProfiles = new MinecraftProfileRepository(deps.db);
    const userService = new UserService(users);
    const sessionService = new SessionService(sessions);
    const invitationService = new InvitationService(invitations);
    const authService = new AuthService(userService, sessionService, invitationService, deps.googleOauthClient);
    const minecraftProfileService = new MinecraftProfileService(minecraftProfiles, deps.mojangClient);
    const minecraftServerService = new MinecraftServerService(minecraftProfileService, deps.rconClient, deps.processClient);
    const userController = new UserController(userService);
    const invitationController = new InvitationController(invitationService);
    const authController = new AuthController(authService);
    const minecraftProfileController = new MinecraftProfileController(minecraftProfileService);
    const minecraftServerController = new MinecraftServerController(minecraftServerService);
    const requireAuth = createRequireAuth(authService);
    router.use("/users", createUserRoutes(userController, requireAuth));
    router.use("/invitations", createInvitationRoutes(invitationController, requireAuth));
    router.use("/auth", createAuthRoutes(authController, requireAuth));
    router.use("/minecraft", createMinecraftRoutes(minecraftProfileController, minecraftServerController, requireAuth));
    return router;
}
//# sourceMappingURL=index.js.map