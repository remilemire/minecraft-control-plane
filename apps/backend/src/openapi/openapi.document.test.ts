// apps/backend/src/openapi/openapi.document.test.ts

import { describe, expect, it } from "vitest";
import { createOpenApiDocument } from "./openapi.document.js";

const EXPECTED_PATHS = [
  "/users/me",
  "/auth/google",
  "/auth/logout",
  "/invitations",
  "/invitations/{invitationId}",
  "/minecraft/profiles",
  "/minecraft/profiles/me",
  "/minecraft/server/status",
  "/minecraft/server/players",
  "/minecraft/server/whitelist/{userId}",
  "/minecraft/server/start",
  "/minecraft/server/stop",
  "/minecraft/server/restart",
] as const;

describe("OpenAPI document", () => {
  const document = createOpenApiDocument();

  it("generates the API contract", () => {
    expect(document.openapi).toBe("3.1.0");
    expect(document.info.title).toBe("Minecraft Server API");
    expect(document.servers).toEqual([{ url: "/api" }]);
    expect(document.paths).toBeDefined();
  });

  it("documents every public route and nothing else", () => {
    for (const path of EXPECTED_PATHS) {
      expect(document.paths?.[path], `missing path ${path}`).toBeDefined();
    }
    expect(Object.keys(document.paths ?? {})).toHaveLength(EXPECTED_PATHS.length);
  });

  it("registers the public resource components", () => {
    const schemas = document.components?.schemas ?? {};
    for (const name of [
      "User",
      "Invitation",
      "MinecraftProfile",
      "MinecraftServerStatus",
      "ValidationIssue",
      "ValidationError",
      "UnauthenticatedError",
      "ConflictError",
      "InternalError",
      "ServiceUnavailableError",
    ]) {
      expect(schemas[name], `missing component schema ${name}`).toBeDefined();
    }
  });

  it("documents the translated error body shape", () => {
    const validationError = document.components?.schemas?.["ValidationError"] as {
      properties?: Record<string, unknown>;
      required?: string[];
    };

    expect(Object.keys(validationError.properties ?? {})).toEqual([
      "kind",
      "code",
      "message",
      "issues",
    ]);
    // `issues` only accompanies schema validation failures.
    expect(validationError.required).toEqual(["kind", "code", "message"]);
  });

  it("derives the MinecraftServerStatus enum from the shared schema", () => {
    const status = document.components?.schemas?.["MinecraftServerStatus"] as {
      properties?: { status?: { enum?: string[] } };
    };
    expect(status.properties?.status?.enum).toEqual(["RUNNING", "STOPPED"]);
  });

  it("registers the cookie security schemes with the real names", () => {
    const schemes = document.components?.securitySchemes as Record<
      string,
      { type: string; in: string; name: string }
    >;

    expect(schemes["sessionCookie"]).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "session_token",
    });
    expect(schemes["csrfCookie"]).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "csrf_token",
    });
    expect(schemes["csrfHeader"]).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "x-csrf-token",
    });
  });

  it("declares session + CSRF security on protected mutations and none on login", () => {
    const invite = document.paths?.["/invitations"]?.post;
    expect(invite?.security).toEqual([{ sessionCookie: [], csrfCookie: [], csrfHeader: [] }]);

    const login = document.paths?.["/auth/google"]?.post;
    expect(login?.security).toBeUndefined();

    const me = document.paths?.["/users/me"]?.get;
    expect(me?.security).toEqual([{ sessionCookie: [] }]);
  });

  it("documents the admin list and profile set endpoints", () => {
    expect(document.paths?.["/invitations"]?.get?.operationId).toBe("listInvitations");
    expect(document.paths?.["/minecraft/profiles"]?.get?.operationId).toBe("listMinecraftProfiles");
    expect(document.paths?.["/minecraft/profiles/me"]?.put?.operationId).toBe(
      "setMinecraftProfile",
    );
  });

  it("documents empty-body mutations with 204 and no 200", () => {
    const logout = document.paths?.["/auth/logout"]?.post?.responses ?? {};
    expect(logout["204"]).toBeDefined();
    expect(logout["200"]).toBeUndefined();

    const restart = document.paths?.["/minecraft/server/restart"]?.post?.responses ?? {};
    expect(restart["204"]).toBeDefined();
    expect(restart["200"]).toBeUndefined();
  });

  it("switches the invitation delete to a path parameter", () => {
    const del = document.paths?.["/invitations/{invitationId}"]?.delete;
    const params = (del?.parameters ?? []) as { name: string; in: string }[];
    expect(params).toContainEqual(expect.objectContaining({ name: "invitationId", in: "path" }));
    expect(del?.requestBody).toBeUndefined();
  });

  it("declares the userId path parameter on whitelist routes", () => {
    const put = document.paths?.["/minecraft/server/whitelist/{userId}"]?.put;
    const params = (put?.parameters ?? []) as { name: string; in: string }[];
    expect(params).toContainEqual(expect.objectContaining({ name: "userId", in: "path" }));
  });

  it("narrows error codes per route", () => {
    const schemas = document.components?.schemas as Record<
      string,
      { properties?: { code?: { enum?: string[] } } }
    >;

    expect(schemas["InvitationNotFoundError"]?.properties?.code?.enum).toEqual([
      "INVITATION_NOT_FOUND",
    ]);
    expect(schemas["UnauthenticatedError"]?.properties?.code?.enum).toEqual([
      "UNAUTHENTICATED",
      "INVALID_SESSION",
    ]);
    expect(schemas["AdminOrCsrfError"]?.properties?.code?.enum).toEqual([
      "ADMIN_REQUIRED",
      "INVALID_CSRF_TOKEN",
    ]);
    // Kind-wide components pick up every catalog code of their kind.
    expect(schemas["ConflictError"]?.properties?.code?.enum).toEqual(
      expect.arrayContaining([
        "GOOGLE_ID_TAKEN",
        "EMAIL_TAKEN",
        "INVITATION_ALREADY_EXISTS",
        "MINECRAFT_USERNAME_TAKEN",
        "MINECRAFT_ACCOUNT_TAKEN",
      ]),
    );
    expect(schemas["ValidationError"]?.properties?.code?.enum).toEqual(
      expect.arrayContaining(["VALIDATION_FAILED"]),
    );
  });
});
