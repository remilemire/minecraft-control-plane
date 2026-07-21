// apps/backend/src/features/auth/auth.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  baseErrorResponses,
  createErrorResponseSchema,
  csrfErrorResponse,
  emptyResponse,
  jsonResponse,
  openApiUserSchema,
  SESSION_AND_CSRF_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import { oauthLoginSchema } from "@minecraft-server/shared/auth";

const invalidGoogleCredentialErrorSchema = openApiRegistry.register(
  "InvalidGoogleCredentialError",
  createErrorResponseSchema("UNAUTHORIZED", ["INVALID_GOOGLE_CREDENTIAL"]),
);

const notInvitedErrorSchema = openApiRegistry.register(
  "NotInvitedError",
  createErrorResponseSchema("FORBIDDEN", ["NOT_INVITED"]),
);

openApiRegistry.registerPath({
  method: "post",
  path: "/auth/google",
  tags: ["Auth"],
  summary: "Log in with a Google ID token",
  description:
    "Public. Verifies the Google credential; first-time users must have a pending invitation. " +
    "On success sets the httpOnly session_token cookie and the readable csrf_token cookie.",
  operationId: "googleLogin",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: oauthLoginSchema } },
    },
  },
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The authenticated user.", openApiUserSchema),
    401: jsonResponse(
      "The Google credential is invalid, expired, or has no verified identity.",
      invalidGoogleCredentialErrorSchema,
    ),
    403: jsonResponse("The Google account has no pending invitation.", notInvitedErrorSchema),
    422: validationErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Log out",
  description: "Deletes the current session and clears the session and CSRF cookies.",
  operationId: "logout",
  security: SESSION_AND_CSRF_SECURITY,
  responses: {
    ...baseErrorResponses,
    204: emptyResponse("Logged out; session and CSRF cookies cleared."),
    401: unauthenticatedResponse,
    403: csrfErrorResponse,
  },
});
