// apps/backend/src/routes/index.ts

import { DatabaseProvider, type Db, TransactionManager } from "@/infrastructure/db/index.js";
import { AuthController } from "@/features/auth/auth.controller.js";
import { createRequireAuth, requireOwner } from "@/features/auth/auth.middleware.js";
import { createAuthRoutes } from "@/features/auth/auth.routes.js";
import { AuthService } from "@/features/auth/auth.service.js";
import type { OAuthApi } from "@/features/auth/auth.types.js";
import { OAuthIdentityRepository } from "@/features/auth/oauth-identities/oauth-identities.repository.js";
import { OAuthIdentityService } from "@/features/auth/oauth-identities/oauth-identities.service.js";
import { SessionRepository } from "@/features/auth/sessions/sessions.repository.js";
import { SessionService } from "@/features/auth/sessions/sessions.service.js";
import { createMinecraftRoutes } from "@/features/minecraft/minecraft.routes.js";
import type { MojangApi, ProcessApi, RconApi } from "@/features/minecraft/minecraft.types.js";
import { MinecraftProfileController } from "@/features/minecraft/profiles/profiles.controller.js";
import {
  WhitelistAddHandler,
  WhitelistRemoveHandler,
} from "@/features/minecraft/profiles/profiles.outbox.js";
import { MinecraftProfileRepository } from "@/features/minecraft/profiles/profiles.repository.js";
import { MinecraftProfileService } from "@/features/minecraft/profiles/profiles.service.js";
import { MinecraftConsoleController } from "@/features/minecraft/server/console/console.controller.js";
import { MinecraftConsoleService } from "@/features/minecraft/server/console/console.service.js";
import { MinecraftServerController } from "@/features/minecraft/server/server.controller.js";
import { createMinecraftServerRoutes } from "@/features/minecraft/server/server.routes.js";
import { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import { UserController } from "@/features/users/users.controller.js";
import { UserRepository } from "@/features/users/users.repository.js";
import { createUserRoutes } from "@/features/users/users.routes.js";
import { UserService } from "@/features/users/users.service.js";
import {
  createOutboxHandlerRegistry,
  OutboxDispatcher,
  OutboxMessageRepository,
  OutboxService,
} from "@/infrastructure/outbox/index.js";
import { outboxMessageDefinitions } from "@/infrastructure/outbox/outbox.registry.js";
import { Router } from "express";
import type { BackupsApi } from "@/features/minecraft/backups/backups.types.js";
import { MinecraftBackupService } from "@/features/minecraft/backups/backups.service.js";
import { MinecraftBackupController } from "@/features/minecraft/backups/backups.controller.js";
import { createMinecraftBackupRoutes } from "@/features/minecraft/backups/backups.routes.js";

// The external boundaries of the app. Production wires the real ones in
// server.ts; tests substitute fakes (see test/helpers/create-test-app.ts).
export interface AppDeps {
  readonly db: Db;
  readonly googleOauthClient: OAuthApi;
  readonly mojangClient: MojangApi;
  readonly rconClient: RconApi;
  readonly processClient: ProcessApi;
  readonly backupsClient: BackupsApi;
}

// The wired dependency graph: the HTTP surface plus the background pieces the
// composition roots own the lifecycle of (server.ts starts the dispatcher;
// tests tick() it deterministically).
export interface AppWiring {
  readonly router: Router;
  readonly outboxDispatcher: OutboxDispatcher;
  closeConsoleStreams(): void;
}

export function createRouter(deps: AppDeps): AppWiring {
  const router = Router();

  const databaseProvider = new DatabaseProvider(deps.db);
  const transactionManager = new TransactionManager(deps.db);

  const users = new UserRepository(databaseProvider);
  const sessions = new SessionRepository(databaseProvider);
  const oauthIdentities = new OAuthIdentityRepository(databaseProvider);
  const minecraftProfiles = new MinecraftProfileRepository(databaseProvider);
  const outboxMessages = new OutboxMessageRepository(databaseProvider);

  const userService = new UserService(users, transactionManager);
  const sessionService = new SessionService(sessions);
  const oauthIdentityService = new OAuthIdentityService(oauthIdentities);
  const outboxService = new OutboxService(outboxMessages, outboxMessageDefinitions);

  const authService = new AuthService(
    userService,
    sessionService,
    { google: deps.googleOauthClient },
    oauthIdentityService,
    transactionManager,
  );
  const requireAuth = createRequireAuth(authService);

  const minecraftServerService = new MinecraftServerService(deps.rconClient, deps.processClient);
  const minecraftConsoleService = new MinecraftConsoleService(deps.rconClient, deps.processClient);
  const minecraftProfileService = new MinecraftProfileService(
    minecraftProfiles,
    deps.mojangClient,
    minecraftServerService,
    transactionManager,
    outboxService,
  );

  const outboxDispatcher = new OutboxDispatcher(
    outboxMessages,
    createOutboxHandlerRegistry(outboxMessageDefinitions, [
      new WhitelistAddHandler(minecraftProfileService, minecraftServerService),
      new WhitelistRemoveHandler(minecraftProfileService, minecraftServerService),
    ]),
  );

  const userController = new UserController(userService);
  const authController = new AuthController(authService);
  const minecraftProfileController = new MinecraftProfileController(minecraftProfileService);
  const minecraftServerController = new MinecraftServerController(minecraftServerService);
  const minecraftConsoleController = new MinecraftConsoleController(minecraftConsoleService);
  const minecraftBackupController = new MinecraftBackupController(
    new MinecraftBackupService(deps.backupsClient),
  );

  router.use("/users", createUserRoutes(userController, requireAuth, requireOwner));
  router.use("/auth", createAuthRoutes(authController, requireAuth));
  router.use(
    "/minecraft/backups",
    createMinecraftBackupRoutes(minecraftBackupController, requireAuth),
  );
  router.use(
    "/minecraft",
    createMinecraftRoutes(
      minecraftProfileController,
      createMinecraftServerRoutes(
        minecraftConsoleController,
        minecraftServerController,
        requireAuth,
      ),
      requireAuth,
    ),
  );

  return {
    router,
    outboxDispatcher,
    closeConsoleStreams: () => {
      minecraftConsoleController.closeStreams();
    },
  };
}
