// apps/backend/routes/index.ts

import type { Db } from "@/db/client.js";
import { TransactionRunner } from "@/db/transactions.js";
import { AuthController } from "@/features/auth/auth.controller.js";
import { createRequireAuth } from "@/features/auth/auth.middleware.js";
import { createAuthRoutes } from "@/features/auth/auth.routes.js";
import { AuthService } from "@/features/auth/auth.service.js";
import type { OAuthApi } from "@/features/auth/auth.types.js";
import { OAuthIdentityRepository } from "@/features/auth/oauth-identities/oauth-identities.repository.js";
import { OAuthIdentityService } from "@/features/auth/oauth-identities/oauth-identities.service.js";
import { InvitationController } from "@/features/invitations/invitations.controller.js";
import { InvitationRepository } from "@/features/invitations/invitations.repository.js";
import { createInvitationRoutes } from "@/features/invitations/invitations.routes.js";
import { InvitationService } from "@/features/invitations/invitations.service.js";
import { createMinecraftRoutes } from "@/features/minecraft/minecraft.routes.js";
import type { MojangApi, ProcessApi, RconApi } from "@/features/minecraft/minecraft.types.js";
import { MinecraftPlayerController } from "@/features/minecraft/players/minecraft-players.controller.js";
import { MinecraftPlayerService } from "@/features/minecraft/players/minecraft-players.service.js";
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

// The external boundaries of the app. Production wires the real ones in
// server.ts; tests substitute fakes (see test/helpers/create-test-app.ts).
export interface AppDeps {
  readonly db: Db;
  readonly googleOauthClient: OAuthApi;
  readonly mojangClient: MojangApi;
  readonly rconClient: RconApi;
  readonly processClient: ProcessApi;
}

export function createRouter(deps: AppDeps): Router {
  const router = Router();

  const users = new UserRepository(deps.db);
  const sessions = new SessionRepository(deps.db);
  const invitations = new InvitationRepository(deps.db);
  const oauthIdentities = new OAuthIdentityRepository(deps.db);
  const minecraftProfiles = new MinecraftProfileRepository(deps.db);

  const userService = new UserService(users);
  const sessionService = new SessionService(sessions);
  const invitationService = new InvitationService(invitations);
  const oauthIdentityService = new OAuthIdentityService(oauthIdentities);

  const transactionRunner = new TransactionRunner(deps.db);

  const authService = new AuthService(
    userService,
    sessionService,
    invitationService,
    { google: deps.googleOauthClient },
    oauthIdentityService,
    transactionRunner,
  );

  const minecraftProfileService = new MinecraftProfileService(minecraftProfiles, deps.mojangClient);
  const minecraftServerService = new MinecraftServerService(deps.rconClient, deps.processClient);
  const minecraftPlayerService = new MinecraftPlayerService(
    minecraftProfileService,
    minecraftServerService,
  );

  const userController = new UserController(userService);
  const invitationController = new InvitationController(invitationService);
  const authController = new AuthController(authService);
  const minecraftPlayerController = new MinecraftPlayerController(minecraftPlayerService);
  const minecraftServerController = new MinecraftServerController(minecraftServerService);

  const requireAuth = createRequireAuth(authService);

  router.use("/users", createUserRoutes(userController, requireAuth));
  router.use("/invitations", createInvitationRoutes(invitationController, requireAuth));
  router.use("/auth", createAuthRoutes(authController, requireAuth));
  router.use(
    "/minecraft",
    createMinecraftRoutes(minecraftPlayerController, minecraftServerController, requireAuth),
  );

  return router;
}
