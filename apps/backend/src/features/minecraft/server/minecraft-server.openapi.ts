// apps/backend/src/features/minecraft/server/minecraft-server.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  adminOrCsrfResponse,
  adminRequiredResponse,
  baseErrorResponses,
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
