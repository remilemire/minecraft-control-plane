// apps/backend/routes/index.ts
import { env } from "@/config/env.js";
import { db } from "@/db/client.js";
import { AuthController } from "@/features/auth/auth.controller.js";
import { createRequireAuth } from "@/features/auth/auth.middleware.js";
import { createAuthRoutes } from "@/features/auth/auth.routes.js";
import { AuthService } from "@/features/auth/auth.service.js";
import { InvitationController } from "@/features/invitations/invitations.controller.js";
import { InvitationRepository } from "@/features/invitations/invitations.repository.js";
import { createInvitationRoutes } from "@/features/invitations/invitations.routes.js";
import { InvitationService } from "@/features/invitations/invitations.service.js";
import { MojangClient } from "@/features/minecraft/clients/mojang.client.js";
import { ProcessClient } from "@/features/minecraft/clients/process.client.js";
import { RconClient } from "@/features/minecraft/clients/rcon.client.js";
import { createMinecraftRoutes } from "@/features/minecraft/minecraft.routes.js";
import { MinecraftProfileController } from "@/features/minecraft/profiles/minecraft-profiles.controller.js";
import { MinecraftProfileRepository } from "@/features/minecraft/profiles/minecraft-profiles.repository.js";
import { MinecraftProfileService } from "@/features/minecraft/profiles/minecraft-profiles.service.js";
import { MinecraftServerController } from "@/features/minecraft/server/minecraft-server.controller.js";
import { MinecraftServerService } from "@/features/minecraft/server/minecraft-server.service.js";
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
const minecraftProfiles = new MinecraftProfileRepository(db);
const userService = new UserService(users);
const sessionService = new SessionService(sessions);
const invitationService = new InvitationService(invitations);
const googleOauthClient = new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
});
const authService = new AuthService(userService, sessionService, invitationService, googleOauthClient);
const mojangClient = new MojangClient();
const minecraftProfileService = new MinecraftProfileService(minecraftProfiles, mojangClient);
const rconClient = new RconClient({
    host: env.MINECRAFT_RCON_HOST,
    password: env.MINECRAFT_RCON_PASSWORD,
    port: env.MINECRAFT_RCON_PORT,
});
const processClient = new ProcessClient({
    composeFile: env.MINECRAFT_COMPOSE_FILE,
    serviceName: env.MINECRAFT_SERVICE_NAME,
});
const minecraftServerService = new MinecraftServerService(rconClient, processClient);
const userController = new UserController(userService);
const invitationController = new InvitationController(invitationService);
const authController = new AuthController(authService);
const minecraftProfileController = new MinecraftProfileController(minecraftProfileService);
const minecraftServerController = new MinecraftServerController(minecraftServerService);
const requireAuth = createRequireAuth(authService);
router.use(createUserRoutes(userController, requireAuth));
router.use(createInvitationRoutes(invitationController, requireAuth));
router.use(createAuthRoutes(authController, requireAuth));
router.use(createMinecraftRoutes(minecraftProfileController, minecraftServerController, requireAuth));
//# sourceMappingURL=index.js.map