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
import { oauthLoginSchema } from "@minecraft-control-plane/shared/auth";

const authenticationFailedErrorSchema = openApiRegistry.register(
  "AuthenticationFailedError",
  createErrorResponseSchema("UNAUTHORIZED", ["AUTHENTICATION_FAILED"]),
);

openApiRegistry.registerPath({
  method: "post",
  path: "/auth/google",
  tags: ["Auth"],
  summary: "Log in with a Google ID token",
  description:
    "Public. Verifies the Google credential; a first-time sign-in must match a user the owner " +
    "provisioned (the bootstrap owner email may create the very first account). " +
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
      "Sign-in failed. One code covers every cause (invalid or unverified credential, " +
        "unregistered email) so responses cannot be used to enumerate accounts.",
      authenticationFailedErrorSchema,
    ),
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
