// apps/backend/src/features/minecraft/server/minecraft-server.openapi.ts

import { minecraftProfileNotFoundErrorSchema } from "@/features/minecraft/profiles/minecraft-profiles.openapi.js";
import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  adminOrCsrfResponse,
  adminRequiredResponse,
  baseErrorResponses,
  createErrorResponseSchema,
  emptyResponse,
  jsonResponse,
  openApiMinecraftServerPlayersSchema,
  openApiMinecraftServerStatusSchema,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import { userIdSchema } from "@minecraft-server/shared/users";
import { z } from "zod";

const minecraftServerUnavailableErrorSchema = openApiRegistry.register(
  "MinecraftServerUnavailableError",
  createErrorResponseSchema("SERVICE_UNAVAILABLE", ["RCON_CLIENT_ERROR", "SERVICE_UNAVAILABLE"]),
);

const minecraftServerUnavailableResponse = jsonResponse(
  "The RCON connection to the Minecraft server (or another dependency) failed.",
  minecraftServerUnavailableErrorSchema,
);

const whitelistParams = z.object({ userId: userIdSchema });

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/server/status",
  tags: ["Minecraft Server"],
  summary: "Get the Minecraft server status",
  description: "Admin only.",
  operationId: "getServerStatus",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse(
      "Whether the Minecraft server container is running.",
      openApiMinecraftServerStatusSchema,
    ),
    401: unauthenticatedResponse,
    403: adminRequiredResponse,
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/server/players",
  tags: ["Minecraft Server"],
  summary: "List online players",
  description: "Admin only.",
  operationId: "listPlayers",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse(
      "Online player count and roster, parsed from the RCON `list` command.",
      openApiMinecraftServerPlayersSchema,
    ),
    401: unauthenticatedResponse,
    403: adminRequiredResponse,
    503: minecraftServerUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "put",
  path: "/minecraft/server/whitelist/{userId}",
  tags: ["Minecraft Server"],
  summary: "Add a username to the whitelist",
  description: "Admin only.",
  operationId: "addToWhitelist",
  security: SESSION_AND_CSRF_SECURITY,
  request: { params: whitelistParams },
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Username added to the whitelist."),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
    404: jsonResponse("The user has no Minecraft profile.", minecraftProfileNotFoundErrorSchema),
    422: validationErrorResponse,
    503: minecraftServerUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "delete",
  path: "/minecraft/server/whitelist/{userId}",
  tags: ["Minecraft Server"],
  summary: "Remove a username from the whitelist",
  description: "Admin only.",
  operationId: "removeFromWhitelist",
  security: SESSION_AND_CSRF_SECURITY,
  request: { params: whitelistParams },
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Username removed from the whitelist."),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
    404: jsonResponse("The user has no Minecraft profile.", minecraftProfileNotFoundErrorSchema),
    422: validationErrorResponse,
    503: minecraftServerUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/server/start",
  tags: ["Minecraft Server"],
  summary: "Start the Minecraft server",
  description: "Admin only. Starts the server container.",
  operationId: "startServer",
  security: SESSION_AND_CSRF_SECURITY,
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Server started."),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/server/stop",
  tags: ["Minecraft Server"],
  summary: "Stop the Minecraft server",
  description: "Admin only. Stops the server container.",
  operationId: "stopServer",
  security: SESSION_AND_CSRF_SECURITY,
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Server stopped."),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/server/restart",
  tags: ["Minecraft Server"],
  summary: "Restart the Minecraft server",
  description: "Admin only. Restarts the server container.",
  operationId: "restartServer",
  security: SESSION_AND_CSRF_SECURITY,
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Server restarted."),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
  },
});
