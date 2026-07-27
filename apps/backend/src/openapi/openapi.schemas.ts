// apps/backend/src/openapi/openapi.schemas.ts

import { ERROR_KIND_TO_HTTP_STATUS } from "@/errors/http-status.js";
import { CSRF_COOKIE, CSRF_HEADER } from "@/http/csrf/csrf.constants.js";
import { SESSION_COOKIE } from "@/http/session/session.constants.js";
import type { ResponseConfig } from "@asteasolutions/zod-to-openapi";
import type { ErrorKind } from "@minecraft-control-plane/shared/common";
import {
  errorMeta,
  validationIssueCodeSchema,
  type ErrorCodeForKind,
} from "@minecraft-control-plane/shared/errors";
import { invitationResponseSchema } from "@minecraft-control-plane/shared/invitations";
import {
  minecraftProfileResponseSchema,
  minecraftServerStatusResponseSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { userResponseSchema } from "@minecraft-control-plane/shared/users";
import { z, type ZodType } from "zod";
import { openApiRegistry } from "./openapi.registry.js";

// --- Security schemes ---------------------------------------------------

// These modules export only the cookie/header names with no other imports,
// so pulling them in here never triggers config/env.js's eager env parsing.
openApiRegistry.registerComponent("securitySchemes", "sessionCookie", {
  type: "apiKey",
  in: "cookie",
  name: SESSION_COOKIE,
  description: "HttpOnly session cookie set by POST /auth/google.",
});

openApiRegistry.registerComponent("securitySchemes", "csrfCookie", {
  type: "apiKey",
  in: "cookie",
  name: CSRF_COOKIE,
  description: "Readable CSRF cookie set by POST /auth/google.",
});

openApiRegistry.registerComponent("securitySchemes", "csrfHeader", {
  type: "apiKey",
  in: "header",
  name: CSRF_HEADER,
  description: "Must echo the csrf_token cookie value (double-submit pattern).",
});

export const SESSION_SECURITY = [{ sessionCookie: [] }];

export const SESSION_AND_CSRF_SECURITY = [{ sessionCookie: [], csrfCookie: [], csrfHeader: [] }];

// --- Error responses ------------------------------------------------------

type ErrorCodesOfKind<Kind extends ErrorKind> = readonly [
  ErrorCodeForKind<Kind>,
  ...ErrorCodeForKind<Kind>[],
];

/**
 * Builds the documented shape of a translated error body (`errors/translator.ts`),
 * narrowed to the codes a route can actually return. The codes must all belong
 * to the given kind (compile error otherwise), so the HTTP status a response is
 * registered under always matches what the translator derives from the metadata.
 */
export function createErrorResponseSchema<const Kind extends ErrorKind>(
  kind: Kind,
  codes: ErrorCodesOfKind<Kind>,
) {
  return z
    .object({
      kind: z.literal(kind),
      code: z.enum(codes),
      message: z.string(),
    })
    .openapi({ description: `Error response (HTTP ${ERROR_KIND_TO_HTTP_STATUS[kind]}).` });
}

/** Every error code of the given kind, for responses that aren't narrowed per route. */
export function errorCodesOfKind<Kind extends ErrorKind>(kind: Kind): ErrorCodesOfKind<Kind> {
  const codes = Object.entries(errorMeta)
    .filter(([, meta]) => meta.kind === kind)
    .map(([code]) => code);
  return codes as unknown as ErrorCodesOfKind<Kind>;
}

export const validationIssueSchema = openApiRegistry.register(
  "ValidationIssue",
  z.object({
    code: validationIssueCodeSchema,
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
  }),
);

export const validationErrorSchema = openApiRegistry.register(
  "ValidationError",
  createErrorResponseSchema("VALIDATION", errorCodesOfKind("VALIDATION"))
    .extend({
      // Present for schema validation failures (VALIDATION_FAILED); database
      // constraint violations carry no issue list.
      issues: z.array(validationIssueSchema).optional(),
    })
    .openapi({ description: "Error response (HTTP 422)." }),
);

export const unauthenticatedErrorSchema = openApiRegistry.register(
  "UnauthenticatedError",
  createErrorResponseSchema("UNAUTHORIZED", ["UNAUTHENTICATED", "INVALID_SESSION"]),
);

export const csrfErrorSchema = openApiRegistry.register(
  "CsrfError",
  createErrorResponseSchema("FORBIDDEN", ["INVALID_CSRF_TOKEN"]),
);

export const conflictErrorSchema = openApiRegistry.register(
  "ConflictError",
  createErrorResponseSchema("CONFLICT", errorCodesOfKind("CONFLICT")),
);

export const internalErrorSchema = openApiRegistry.register(
  "InternalError",
  createErrorResponseSchema("INTERNAL", ["INTERNAL"]),
);

export const serviceUnavailableErrorSchema = openApiRegistry.register(
  "ServiceUnavailableError",
  createErrorResponseSchema("SERVICE_UNAVAILABLE", ["SERVICE_UNAVAILABLE"]),
);

// --- Response helpers -----------------------------------------------------

export function jsonResponse(description: string, schema: ZodType): ResponseConfig {
  return { description, content: { "application/json": { schema } } };
}

export function emptyResponse(description: string): ResponseConfig {
  return { description };
}

export const unauthenticatedResponse = jsonResponse(
  "Missing session cookie, or the session is invalid or expired.",
  unauthenticatedErrorSchema,
);

export const csrfErrorResponse = jsonResponse("CSRF token missing or invalid.", csrfErrorSchema);

export const validationErrorResponse = jsonResponse(
  "The request failed validation.",
  validationErrorSchema,
);

export const conflictErrorResponse = jsonResponse(
  "The request conflicts with existing data.",
  conflictErrorSchema,
);

// Failure modes every route shares: unexpected errors (500) and an
// unreachable database or other dependency (503). Spread into each path's
// `responses`; routes with a more specific 503 override it after the spread.
export const baseErrorResponses = {
  500: jsonResponse("Unexpected server error.", internalErrorSchema),
  503: jsonResponse(
    "A dependency (e.g. the database) could not be reached.",
    serviceUnavailableErrorSchema,
  ),
};

// --- Public resource components --------------------------------------------

export const openApiUserSchema = openApiRegistry.register("User", userResponseSchema);

export const openApiInvitationSchema = openApiRegistry.register(
  "Invitation",
  invitationResponseSchema,
);

export const openApiMinecraftProfileSchema = openApiRegistry.register(
  "MinecraftProfile",
  minecraftProfileResponseSchema,
);

export const openApiMinecraftServerStatusSchema = openApiRegistry.register(
  "MinecraftServerStatus",
  minecraftServerStatusResponseSchema,
);
