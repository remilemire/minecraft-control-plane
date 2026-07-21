// apps/backend/test/api/auth.api.test.ts

import { SESSION_COOKIE } from "@/http/session/session.constants.js";
import { CSRF_COOKIE } from "@/http/csrf/csrf.constants.js";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/helpers/create-test-app.js";
import { createInvitation } from "@test/helpers/factories/invitation.factory.js";
import { createOAuthIdentity } from "@test/helpers/factories/oauth-identity.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { csrfPair, findSetCookie, isClearedCookie } from "@test/helpers/test-cookies.js";

let testApp: TestApp;

// A fresh app + fakes per test so a previous test's Google identities and
// issued sessions never leak into the next one.
beforeEach(() => {
  testApp = createTestApp();
});

describe("POST /api/auth/google", () => {
  it("logs in an existing user and sets the session and CSRF cookies", async () => {
    const { app, googleOauthClient } = testApp;
    const user = await createUser({ email: "steve@example.com" });
    await createOAuthIdentity({
      userId: user.id,
      provider: "google",
      subject: "google-oauth-sub",
    });
    const credential = googleOauthClient.issueToken({
      email: "steve@example.com",
      sub: "google-oauth-sub",
    });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: user.id, email: "steve@example.com" });

    const sessionCookie = findSetCookie(response, SESSION_COOKIE);
    const csrfCookie = findSetCookie(response, CSRF_COOKIE);
    expect(sessionCookie).toContain("HttpOnly");
    // The CSRF cookie must be readable by the SPA, so it is not HttpOnly.
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toContain("HttpOnly");
  });

  it("registers an invited user on first login, and persists the identity for a later login", async () => {
    const { app, googleOauthClient } = testApp;
    await createInvitation({ email: "newplayer@example.com" });
    const credential = googleOauthClient.issueToken({
      email: "newplayer@example.com",
      sub: "google-newplayer",
      given_name: "New",
      family_name: "Player",
    });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: "newplayer@example.com",
      firstName: "New",
      lastName: "Player",
      isAdmin: false,
    });
    expect(response.body.id).toBeDefined();
    expect(findSetCookie(response, SESSION_COOKIE)).toBeDefined();

    // The first-login identity must have been persisted: a later login with
    // the same provider subject resolves to the same user, rather than
    // re-registering (and without needing a still-valid invitation).
    const laterCredential = googleOauthClient.issueToken({
      email: "newplayer@example.com",
      sub: "google-newplayer",
    });
    const laterResponse = await request(app)
      .post("/api/auth/google")
      .send({ credential: laterCredential });

    expect(laterResponse.status).toBe(200);
    expect(laterResponse.body.id).toBe(response.body.id);
  });

  it("rejects an invalid Google credential", async () => {
    const { app } = testApp;

    // Never issued by the fake verifier, so it rejects like the real library.
    const response = await request(app)
      .post("/api/auth/google")
      .send({ credential: "not-a-real-token" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      kind: "UNAUTHORIZED",
      code: "INVALID_GOOGLE_CREDENTIAL",
    });
    expect(findSetCookie(response, SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects a login without an invitation", async () => {
    const { app, googleOauthClient } = testApp;
    const credential = googleOauthClient.issueToken({ email: "uninvited@example.com" });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ kind: "FORBIDDEN", code: "NOT_INVITED" });
    expect(findSetCookie(response, SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects a token whose email is unverified", async () => {
    const { app, googleOauthClient } = testApp;
    await createInvitation({ email: "unverified@example.com" });
    const credential = googleOauthClient.issueToken({
      email: "unverified@example.com",
      email_verified: false,
    });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "INVALID_GOOGLE_CREDENTIAL" });
  });

  it("rejects a request with a missing credential", async () => {
    const { app } = testApp;

    const response = await request(app).post("/api/auth/google").send({});

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
    expect(response.body.issues).toEqual([expect.objectContaining({ path: ["credential"] })]);
  });
});

describe("POST /api/auth/logout", () => {
  it("deletes the session and clears both cookies", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(isClearedCookie(findSetCookie(response, SESSION_COOKIE))).toBe(true);
    expect(isClearedCookie(findSetCookie(response, CSRF_COOKIE))).toBe(true);

    // The session is gone: the old cookie no longer authenticates.
    const afterLogout = await request(app).get("/api/users/me").set("Cookie", [auth.cookie]);
    expect(afterLogout.status).toBe(401);
  });

  it("requires a session", async () => {
    const { app } = testApp;
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", [csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ kind: "UNAUTHORIZED", code: "UNAUTHENTICATED" });
  });

  it("requires the CSRF pair", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app).post("/api/auth/logout").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
  });
});
