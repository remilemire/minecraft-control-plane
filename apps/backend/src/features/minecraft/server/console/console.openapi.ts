// apps/backend/src/features/minecraft/server/console/console.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  baseErrorResponses,
  csrfErrorResponse,
  emptyResponse,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import { minecraftConsoleCommandSchema } from "@minecraft-control-plane/shared/minecraft";
import { z } from "zod";

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/server/console/logs",
  tags: ["Minecraft Server"],
  summary: "Follow the Minecraft server console logs",
  description:
    "Opens a Server-Sent Events stream. Each `log` event's data is a JSON object with `stream` and `line` fields.",
  operationId: "streamMinecraftConsoleLogs",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: {
      description: "A live stream of Minecraft stdout and stderr lines.",
      content: {
        "text/event-stream": {
          schema: z.string().openapi({
            example: 'event: log\ndata: {"stream":"stdout","line":"Done"}\n\n',
          }),
        },
      },
    },
    401: unauthenticatedResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/server/console/commands",
  tags: ["Minecraft Server"],
  summary: "Execute a Minecraft server console command",
  description: "Executes the command over RCON. The command should not include a leading slash.",
  operationId: "executeMinecraftConsoleCommand",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: minecraftConsoleCommandSchema } },
    },
  },
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Command accepted and executed."),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
    422: validationErrorResponse,
  },
});
