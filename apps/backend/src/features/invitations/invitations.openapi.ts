// apps/backend/src/features/invitations/invitations.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  adminOrCsrfResponse,
  adminRequiredResponse,
  baseErrorResponses,
  conflictErrorResponse,
  createErrorResponseSchema,
  jsonResponse,
  openApiInvitationSchema,
  SESSION_AND_CSRF_SECURITY,
  SESSION_SECURITY,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/openapi/openapi.schemas.js";
import { createInvitationSchema, invitationIdSchema } from "@minecraft-server/shared/invitations";
import { z } from "zod";

const invitationNotFoundErrorSchema = openApiRegistry.register(
  "InvitationNotFoundError",
  createErrorResponseSchema("NOT_FOUND", ["INVITATION_NOT_FOUND"]),
);

openApiRegistry.registerPath({
  method: "get",
  path: "/invitations",
  tags: ["Invitations"],
  summary: "List all invitations",
  description: "Admin only.",
  operationId: "listInvitations",
  security: SESSION_SECURITY,
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("All invitations.", z.array(openApiInvitationSchema)),
    401: unauthenticatedResponse,
    403: adminRequiredResponse,
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: "/invitations",
  tags: ["Invitations"],
  summary: "Invite a user by email",
  description:
    "Admin only. Creates an invitation that allows the email to register via Google login until it expires.",
  operationId: "createInvitation",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createInvitationSchema } },
    },
  },
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The created invitation.", openApiInvitationSchema),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
    409: conflictErrorResponse,
    422: validationErrorResponse,
  },
});

openApiRegistry.registerPath({
  method: "delete",
  path: "/invitations/{invitationId}",
  tags: ["Invitations"],
  summary: "Delete an invitation",
  description: "Admin only.",
  operationId: "deleteInvitation",
  security: SESSION_AND_CSRF_SECURITY,
  request: {
    params: z.object({ invitationId: invitationIdSchema }),
  },
  responses: {
    ...baseErrorResponses,
    200: jsonResponse("The deleted invitation.", openApiInvitationSchema),
    401: unauthenticatedResponse,
    403: adminOrCsrfResponse,
    404: jsonResponse("No invitation with this id exists.", invitationNotFoundErrorSchema),
    422: validationErrorResponse,
  },
});
