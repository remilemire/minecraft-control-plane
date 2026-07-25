// apps/backend/src/features/users/users.openapi.ts

import { openApiRegistry } from "@/openapi/openapi.registry.js";
import {
  baseErrorResponses,
  jsonResponse,
  openApiUserSchema,
  SESSION_SECURITY,
  unauthenticatedResponse,
} from "@/openapi/openapi.schemas.js";
import { z } from "zod";

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
