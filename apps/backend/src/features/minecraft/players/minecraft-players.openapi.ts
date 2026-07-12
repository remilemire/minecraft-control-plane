// apps/backend/src/features/minecraft/players/minecraft-players.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  adminOrCsrfResponse,
  adminRequiredResponse,
  baseErrorResponses,
  conflictErrorResponse,
  createErrorResponseSchema,
  csrfErrorResponse,
  emptyResponse,
  jsonResponse,
  openApiMinecraftPlayerSchema,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import { setMinecraftPlayerSchema } from "@minecraft-server/shared/minecraft";
import { userIdSchema } from "@minecraft-server/shared/users";
import { z } from "zod";

export const minecraftProfileNotFoundErrorSchema = openApiRegistry.register(
  "MinecraftProfileNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["MINECRAFT_PROFILE_NOT_FOUND"]),
);

const mojangProfileNotFoundErrorSchema = openApiRegistry.register(
  "MojangProfileNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["MOJANG_PROFILE_NOT_FOUND"]),
);

// GET/DELETE only ever touch RCON (listing online usernames / editing the
// whitelist); PUT also resolves the username against Mojang first, so it can
// additionally fail with MOJANG_CLIENT_ERROR.
const minecraftServerUnavailableErrorSchema = openApiRegistry.register(
  "MinecraftServerUnavailableError",
  createErrorResponseSchema("SERVICE_UNAVAILABLE", ["RCON_CLIENT_ERROR", "SERVICE_UNAVAILABLE"]),
);

const minecraftServerUnavailableResponse = jsonResponse(
  "The RCON connection to the Minecraft server (or another dependency) failed.",
  minecraftServerUnavailableErrorSchema,
);

const minecraftDependencyUnavailableErrorSchema = openApiRegistry.register(
  "MinecraftDependencyUnavailableError",
  createErrorResponseSchema("SERVICE_UNAVAILABLE", [
    "MOJANG_CLIENT_ERROR",
    "RCON_CLIENT_ERROR",
    "SERVICE_UNAVAILABLE",
  ]),
);

const minecraftDependencyUnavailableResponse = jsonResponse(
  "Mojang, the Minecraft server's RCON connection, or another dependency could not be reached.",
  minecraftDependencyUnavailableErrorSchema,
);

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/players",
  tags: ["Minecraft Players"],
  summary: "List every linked player and their online status",
  description: "Admin only.",
  operationId: "listMinecraftPlayers",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("All linked players.", z.array(openApiMinecraftPlayerSchema)),
    401: unauthenticatedResponse,
    403: adminRequiredResponse,
    503: minecraftServerUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/players/me",
  tags: ["Minecraft Players"],
  summary: "Get the authenticated user's Minecraft player",
  operationId: "getMinecraftPlayer",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The user's Minecraft player.", openApiMinecraftPlayerSchema),
    401: unauthenticatedResponse,
    404: jsonResponse("The user has no Minecraft profile.", minecraftProfileNotFoundErrorSchema),
    503: minecraftServerUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "put",
  path: "/minecraft/players/me",
  tags: ["Minecraft Players"],
  summary: "Link or replace the authenticated user's Minecraft account",
  description:
    "Resolves the username against Mojang, stores the account's uuid, and whitelists it " +
    "on the Minecraft server.",
  operationId: "setMinecraftPlayer",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: setMinecraftPlayerSchema } },
    },
  },
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The linked Minecraft player.", openApiMinecraftPlayerSchema),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
    404: jsonResponse(
      "No Mojang account with this username exists.",
      mojangProfileNotFoundErrorSchema,
    ),
    409: conflictErrorResponse,
    422: validationErrorResponse,
    503: minecraftDependencyUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "delete",
  path: "/minecraft/players/{userId}",
  tags: ["Minecraft Players"],
  summary: "Unlink a user's Minecraft account",
  description: "Admin only. Removes the profile and the username from the whitelist.",
  operationId: "deleteMinecraftPlayer",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    params: z.object({ userId: userIdSchema }),
  },
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Profile removed and username unwhitelisted."),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
    404: jsonResponse("The user has no Minecraft profile.", minecraftProfileNotFoundErrorSchema),
    422: validationErrorResponse,
    503: minecraftServerUnavailableResponse,
  },
});
