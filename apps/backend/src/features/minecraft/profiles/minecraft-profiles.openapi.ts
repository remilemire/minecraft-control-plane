// apps/backend/src/features/minecraft/profiles/minecraft-profiles.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  adminRequiredResponse,
  baseErrorResponses,
  conflictErrorResponse,
  createErrorResponseSchema,
  csrfErrorResponse,
  jsonResponse,
  openApiMinecraftProfileSchema,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import { updateMinecraftProfileSchema } from "@minecraft-server/shared/minecraft";
import { z } from "zod";

export const minecraftProfileNotFoundErrorSchema = openApiRegistry.register(
  "MinecraftProfileNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["MINECRAFT_PROFILE_NOT_FOUND"]),
);

const mojangProfileNotFoundErrorSchema = openApiRegistry.register(
  "MojangProfileNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["MOJANG_PROFILE_NOT_FOUND"]),
);

const mojangUnavailableErrorSchema = openApiRegistry.register(
  "MojangUnavailableError",
  createErrorResponseSchema("SERVICE_UNAVAILABLE", ["MOJANG_CLIENT_ERROR", "SERVICE_UNAVAILABLE"]),
);

const mojangUnavailableResponse = jsonResponse(
  "Mojang (or another dependency) could not be reached or returned an unexpected response.",
  mojangUnavailableErrorSchema,
);

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/profiles",
  tags: ["Minecraft Profiles"],
  summary: "List all Minecraft profiles",
  description: "Admin only.",
  operationId: "listMinecraftProfiles",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("All Minecraft profiles.", z.array(openApiMinecraftProfileSchema)),
    401: unauthenticatedResponse,
    403: adminRequiredResponse,
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/minecraft/profiles/me",
  tags: ["Minecraft Profiles"],
  summary: "Get the authenticated user's Minecraft profile",
  operationId: "getMinecraftProfile",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The user's Minecraft profile.", openApiMinecraftProfileSchema),
    401: unauthenticatedResponse,
    404: jsonResponse("The user has no Minecraft profile.", minecraftProfileNotFoundErrorSchema),
  },
});

openApiRegistry.registerPath({
  method: "put",
  path: "/minecraft/profiles/me",
  tags: ["Minecraft Profiles"],
  summary: "Create or replace the authenticated user's Minecraft profile",
  description:
    "Resolves the username against Mojang and stores the account's uuid, creating the " +
    "profile if the user has none or replacing it otherwise.",
  operationId: "setMinecraftProfile",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: updateMinecraftProfileSchema } },
    },
  },
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The created or updated Minecraft profile.", openApiMinecraftProfileSchema),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
    404: jsonResponse(
      "No Mojang account with this username exists.",
      mojangProfileNotFoundErrorSchema,
    ),
    409: conflictErrorResponse,
    422: validationErrorResponse,
    502: mojangUnavailableResponse,
  },
});
