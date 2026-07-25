// apps/backend/src/features/minecraft/profiles/profiles.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  baseErrorResponses,
  conflictErrorResponse,
  createErrorResponseSchema,
  csrfErrorResponse,
  emptyResponse,
  jsonResponse,
  openApiMinecraftProfileSchema,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import {
  createMinecraftProfileSchema,
  minecraftProfileIdSchema,
} from "@minecraft-server/shared/minecraft";
import { z } from "zod";

const minecraftProfileNotFoundErrorSchema = openApiRegistry.register(
  "MinecraftProfileNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["MINECRAFT_PROFILE_NOT_FOUND"]),
);

const mojangProfileNotFoundErrorSchema = openApiRegistry.register(
  "MojangProfileNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["MOJANG_PROFILE_NOT_FOUND"]),
);

// GET reads online status over RCON; POST only talks to Mojang in-request
// (the whitelist command runs through the outbox after commit); DELETE
// touches neither, so it keeps the base 503.
const minecraftServerUnavailableErrorSchema = openApiRegistry.register(
  "MinecraftServerUnavailableError",
  createErrorResponseSchema("SERVICE_UNAVAILABLE", ["RCON_CLIENT_ERROR", "SERVICE_UNAVAILABLE"]),
);

const minecraftServerUnavailableResponse = jsonResponse(
  "The RCON connection to the Minecraft server (or another dependency) failed.",
  minecraftServerUnavailableErrorSchema,
);

const mojangUnavailableErrorSchema = openApiRegistry.register(
  "MojangUnavailableError",
  createErrorResponseSchema("SERVICE_UNAVAILABLE", ["MOJANG_CLIENT_ERROR", "SERVICE_UNAVAILABLE"]),
);

const mojangUnavailableResponse = jsonResponse(
  "Mojang (or another dependency) could not be reached.",
  mojangUnavailableErrorSchema,
);

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/profiles",
  tags: ["Minecraft Profiles"],
  summary: "List every whitelisted profile and their online status",
  operationId: "listMinecraftProfiles",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("All whitelisted profiles.", z.array(openApiMinecraftProfileSchema)),
    401: unauthenticatedResponse,
    503: minecraftServerUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/minecraft/profiles",
  tags: ["Minecraft Profiles"],
  summary: "Whitelist a Minecraft account",
  description:
    "Resolves the username against Mojang, stores the account, and whitelists it on the " +
    "Minecraft server (asynchronously, moments after the response).",
  operationId: "createMinecraftProfile",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createMinecraftProfileSchema } },
    },
  },
  responses: {
    ...baseErrorResponses,
    201: jsonResponse("The whitelisted profile.", openApiMinecraftProfileSchema),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
    404: jsonResponse(
      "No Mojang account with this username exists.",
      mojangProfileNotFoundErrorSchema,
    ),
    409: conflictErrorResponse,
    422: validationErrorResponse,
    503: mojangUnavailableResponse,
  },
});

openApiRegistry.registerPath({
  method: "delete",
  path: "/minecraft/profiles/{minecraftProfileId}",
  tags: ["Minecraft Profiles"],
  summary: "Remove a whitelisted profile",
  description:
    "Deletes the profile and removes the username from the whitelist (asynchronously, " +
    "moments after the response).",
  operationId: "deleteMinecraftProfile",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    params: z.object({ minecraftProfileId: minecraftProfileIdSchema }),
  },
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Profile removed and username unwhitelisted."),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
    404: jsonResponse("No profile with this id exists.", minecraftProfileNotFoundErrorSchema),
    422: validationErrorResponse,
  },
});
