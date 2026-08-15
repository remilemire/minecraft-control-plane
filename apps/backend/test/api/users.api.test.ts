// apps/backend/test/api/users.api.test.ts

import { randomUUID } from "crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "@test/helpers/create-test-app.js";
import { createSession } from "@test/helpers/factories/session.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { csrfPair, sessionCookie } from "@test/helpers/test-cookies.js";

const { app } = createTestApp();

const PUBLIC_USER_KEYS = ["id", "email", "fullName", "isOwner", "createdAt"] as const;

describe("GET /api/users", () => {
  it("returns every user's public shape for any authenticated user", async () => {
    const auth = await authenticateUser();
    const other = await createUser({ fullName: "Alex Builder" });

    const response = await request(app).get("/api/users").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: auth.user.id }),
        expect.objectContaining({
          id: other.id,
          email: other.email,
          fullName: "Alex Builder",
        }),
      ]),
    );
    // The response schema must not leak internal columns.
    for (const user of response.body) {
      expect(Object.keys(user).sort()).toEqual([...PUBLIC_USER_KEYS].sort());
    }
  });

  it("rejects requests without a session", async () => {
    const response = await request(app).get("/api/users");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ kind: "UNAUTHORIZED", code: "UNAUTHENTICATED" });
  });
});

describe("GET /api/users/me", () => {
  it("returns the authenticated user's public shape", async () => {
    const auth = await authenticateUser({ fullName: "Steve Miner" });

    const response = await request(app).get("/api/users/me").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: auth.user.id,
      email: auth.user.email,
      fullName: "Steve Miner",
    });
    expect(response.body.createdAt).toBeDefined();
    // The response schema must not leak internal columns.
    expect(Object.keys(response.body).sort()).toEqual([...PUBLIC_USER_KEYS].sort());
  });

  it("returns a null name when the user has none", async () => {
    const auth = await authenticateUser();

    const response = await request(app).get("/api/users/me").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ fullName: null });
  });

  it("rejects requests without a session", async () => {
    const response = await request(app).get("/api/users/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ kind: "UNAUTHORIZED", code: "UNAUTHENTICATED" });
  });

  it("rejects an unknown session token", async () => {
    const response = await request(app)
      .get("/api/users/me")
      .set("Cookie", [sessionCookie("does-not-exist")]);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ kind: "UNAUTHORIZED", code: "INVALID_SESSION" });
  });

  it("rejects an expired session", async () => {
    const user = await createUser();
    const { sessionToken } = await createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() - 1_000),
    });

    const response = await request(app)
      .get("/api/users/me")
      .set("Cookie", [sessionCookie(sessionToken)]);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ kind: "UNAUTHORIZED", code: "INVALID_SESSION" });
  });
});

describe("POST /api/users", () => {
  it("lets the owner provision a user, created as a non-owner", async () => {
    const auth = await authenticateUser({ isOwner: true });
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/users")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ email: "provisioned@example.com", fullName: "New Player" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      email: "provisioned@example.com",
      fullName: "New Player",
      isOwner: false,
    });
    expect(Object.keys(response.body).sort()).toEqual([...PUBLIC_USER_KEYS].sort());
  });

  it("rejects a non-owner with NOT_OWNER", async () => {
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/users")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ email: "provisioned@example.com" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ kind: "FORBIDDEN", code: "NOT_OWNER" });
  });

  it("requires the CSRF pair even for the owner", async () => {
    const auth = await authenticateUser({ isOwner: true });

    const response = await request(app)
      .post("/api/users")
      .set("Cookie", [auth.cookie])
      .send({ email: "provisioned@example.com" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
  });

  it("maps a duplicate email to EMAIL_TAKEN", async () => {
    const auth = await authenticateUser({ isOwner: true });
    const existing = await createUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/users")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ email: existing.email });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ kind: "CONFLICT", code: "EMAIL_TAKEN" });
  });

  it("rejects an invalid body", async () => {
    const auth = await authenticateUser({ isOwner: true });
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/users")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ email: "not-an-email" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
  });
});

describe("POST /api/users/:userId/transfer-ownership", () => {
  it("moves ownership to the target, leaving exactly one owner", async () => {
    const auth = await authenticateUser({ isOwner: true });
    const target = await createUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post(`/api/users/${target.id}/transfer-ownership`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: target.id, isOwner: true });

    const list = await request(app).get("/api/users").set("Cookie", [auth.cookie]);
    const owners = (list.body as { id: string; isOwner: boolean }[]).filter((user) => user.isOwner);
    expect(owners.map((user) => user.id)).toEqual([target.id]);
  });

  it("rejects a non-owner with NOT_OWNER", async () => {
    const auth = await authenticateUser();
    const target = await createUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post(`/api/users/${target.id}/transfer-ownership`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ kind: "FORBIDDEN", code: "NOT_OWNER" });
  });

  it("rejects an unknown target with USER_NOT_FOUND", async () => {
    const auth = await authenticateUser({ isOwner: true });
    const csrf = csrfPair();

    const response = await request(app)
      .post(`/api/users/${randomUUID()}/transfer-ownership`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: "NOT_FOUND", code: "USER_NOT_FOUND" });
  });

  it("rejects a self-transfer", async () => {
    const auth = await authenticateUser({ isOwner: true });
    const csrf = csrfPair();

    const response = await request(app)
      .post(`/api/users/${auth.user.id}/transfer-ownership`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ kind: "CONFLICT", code: "CANNOT_TRANSFER_TO_SELF" });
  });

  it("rejects a malformed user id", async () => {
    const auth = await authenticateUser({ isOwner: true });
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/users/not-a-uuid/transfer-ownership")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
  });
});
