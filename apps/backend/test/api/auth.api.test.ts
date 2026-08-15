// apps/backend/test/api/auth.api.test.ts

import { SESSION_COOKIE } from "@/http/session/session.constants.js";
import { CSRF_COOKIE } from "@/http/csrf/csrf.constants.js";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/helpers/create-test-app.js";
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

  it("claims a provisioned account on first login: links the identity, adopts the name, stamps the login", async () => {
    const { app, googleOauthClient } = testApp;
    // Owners provision the user row ahead of time; no identity, no name, and
    // no login yet.
    const provisioned = await createUser({ email: "newplayer@example.com" });
    expect(provisioned.lastLoginAt).toBeNull();
    const credential = googleOauthClient.issueToken({
      email: "newplayer@example.com",
      sub: "google-newplayer",
      name: "New Player",
    });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: provisioned.id,
      email: "newplayer@example.com",
      // The first sign-in adopts the Google profile name and stamps the login.
      fullName: "New Player",
    });
    expect(response.body.lastLoginAt).not.toBeNull();
    expect(findSetCookie(response, SESSION_COOKIE)).toBeDefined();

    // The first-login identity must have been persisted: a later login with
    // the same provider subject resolves to the same user — and a changed
    // Google name no longer overwrites the adopted one.
    const laterCredential = googleOauthClient.issueToken({
      email: "newplayer@example.com",
      sub: "google-newplayer",
      name: "Renamed Player",
    });
    const laterResponse = await request(app)
      .post("/api/auth/google")
      .send({ credential: laterCredential });

    expect(laterResponse.status).toBe(200);
    expect(laterResponse.body.id).toBe(provisioned.id);
    expect(laterResponse.body.fullName).toBe("New Player");
  });

  it("matches a provisioned account regardless of the provider email's casing", async () => {
    const { app, googleOauthClient } = testApp;
    const provisioned = await createUser({ email: "cased@example.com" });
    const credential = googleOauthClient.issueToken({
      email: "Cased@Example.com",
      sub: "google-cased",
    });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(provisioned.id);
  });

  it("bootstraps the first account for the bootstrap owner email, as the owner", async () => {
    const { app, googleOauthClient } = testApp;
    // setup-env.ts sets BOOTSTRAP_OWNER_EMAIL for every worker; issuing a
    // token for it exercises the one path that may create an account.
    const bootstrapEmail = process.env.BOOTSTRAP_OWNER_EMAIL ?? "";
    const credential = googleOauthClient.issueToken({
      email: bootstrapEmail,
      sub: "google-bootstrap",
    });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email: bootstrapEmail, isOwner: true });
    expect(response.body.lastLoginAt).not.toBeNull();
    expect(findSetCookie(response, SESSION_COOKIE)).toBeDefined();
  });

  it("rejects the bootstrap owner email once an owner exists", async () => {
    const { app, googleOauthClient } = testApp;
    await createUser({ email: "current-owner@example.com", isOwner: true });
    const credential = googleOauthClient.issueToken({
      email: process.env.BOOTSTRAP_OWNER_EMAIL ?? "",
      sub: "google-bootstrap-late",
    });

    const response = await request(app).post("/api/auth/google").send({ credential });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ kind: "UNAUTHORIZED", code: "AUTHENTICATION_FAILED" });
    expect(findSetCookie(response, SESSION_COOKIE)).toBeUndefined();
  });

  // The anti-enumeration invariant: every failure mode answers with the exact
  // same status and body, so a response can't reveal whether an email has an
  // account (or an invalid token from a registered user's browser differs
  // from a stranger's).
  it("answers every login failure with one identical 401 body", async () => {
    const { app, googleOauthClient } = testApp;
    await createUser({ email: "registered@example.com" });

    const failures = [
      // Never issued by the fake verifier, like a forged or expired token.
      request(app).post("/api/auth/google").send({ credential: "not-a-real-token" }),
      // Verified token for an email nobody provisioned.
      request(app)
        .post("/api/auth/google")
        .send({ credential: googleOauthClient.issueToken({ email: "stranger@example.com" }) }),
      // Unverified email on an otherwise valid token for a registered user.
      request(app)
        .post("/api/auth/google")
        .send({
          credential: googleOauthClient.issueToken({
            email: "registered@example.com",
            email_verified: false,
          }),
        }),
    ];

    const responses = await Promise.all(failures);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual(responses[0]?.body);
      expect(findSetCookie(response, SESSION_COOKIE)).toBeUndefined();
    }
    expect(responses[0]?.body).toMatchObject({
      kind: "UNAUTHORIZED",
      code: "AUTHENTICATION_FAILED",
    });
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
