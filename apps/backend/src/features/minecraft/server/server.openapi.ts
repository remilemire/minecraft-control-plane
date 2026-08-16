// apps/backend/src/features/minecraft/server/server.openapi.ts

import "./console/console.openapi.js";

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  baseErrorResponses,
  csrfErrorResponse,
  emptyResponse,
  jsonResponse,
  openApiMinecraftServerStatusSchema,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
} from "@/openapi/openapi.schemas.js";

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/server/status",
  tags: ["Minecraft Server"],
  summary: "Get the Minecraft server status",
  operationId: "getServerStatus",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse(
      "Whether the Minecraft server container is running.",
      openApiMinecraftServerStatusSchema,
    ),
    401: unauthenticatedResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/server/start",
  tags: ["Minecraft Server"],
  summary: "Start the Minecraft server",
  description: "Starts the server container.",
  operationId: "startServer",
  security: SESSION_AND_CSRF_SECURITY,
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Server started."),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/server/stop",
  tags: ["Minecraft Server"],
  summary: "Stop the Minecraft server",
  description: "Stops the server container.",
  operationId: "stopServer",
  security: SESSION_AND_CSRF_SECURITY,
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Server stopped."),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/server/restart",
  tags: ["Minecraft Server"],
  summary: "Restart the Minecraft server",
  description: "Restarts the server container.",
  operationId: "restartServer",
  security: SESSION_AND_CSRF_SECURITY,
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Server restarted."),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
  },
});
