// apps/backend/src/features/users/users.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  baseErrorResponses,
  conflictErrorResponse,
  createErrorResponseSchema,
  jsonResponse,
  openApiUserSchema,
  ownerOnlyErrorResponse,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import { emailSchema } from "@minecraft-control-plane/shared/common";
import { createUserSchema, nameSchema, userIdSchema } from "@minecraft-control-plane/shared/users";
import { z } from "zod";

const userNotFoundErrorSchema = openApiRegistry.register(
  "UserNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["USER_NOT_FOUND"]),
);

// zod-to-openapi renders a `.pipe()`'s *input* schema for request bodies
// (dropping emailSchema's `email` format) and treats `.exactOptional()` as
// required; override both fields for documentation purposes (`.openapi()`
// returns a new schema, no mutation).
const openApiCreateUserSchema = createUserSchema.extend({
  email: emailSchema.openapi({ format: "email" }),
  fullName: nameSchema.optional(),
});

openApiRegistry.registerPath({
  method: "get",
  path: "/users",
  tags: ["Users"],
  summary: "List all users",
  operationId: "listUsers",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("All registered users.", z.array(openApiUserSchema)),
    401: unauthenticatedResponse,
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: "/users/me",
  tags: ["Users"],
  summary: "Get the authenticated user",
  operationId: "getMe",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The authenticated user.", openApiUserSchema),
    401: unauthenticatedResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/users",
  tags: ["Users"],
  summary: "Create a user",
  description:
    "Owner only. Provisions an account for the email; its first Google sign-in claims it.",
  operationId: "createUser",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: openApiCreateUserSchema } },
    },
  },
  responses: {
    ...baseErrorResponses,
    201: jsonResponse("The created user.", openApiUserSchema),
    401: unauthenticatedResponse,
    403: ownerOnlyErrorResponse,
    409: conflictErrorResponse,
    422: validationErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/users/{userId}/transfer-ownership",
  tags: ["Users"],
  summary: "Transfer ownership to another user",
  description:
    "Owner only. Atomically makes the target user the owner (there is always at most one).",
  operationId: "transferOwnership",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    params: z.object({ userId: userIdSchema }),
  },
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The new owner.", openApiUserSchema),
    401: unauthenticatedResponse,
    403: ownerOnlyErrorResponse,
    404: jsonResponse("No user with this id exists.", userNotFoundErrorSchema),
    409: conflictErrorResponse,
    422: validationErrorResponse,
  },
});
