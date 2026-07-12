// apps/backend/test/api/users.api.test.ts

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "@test/helpers/create-test-app.js";
import { createSession } from "@test/helpers/factories/session.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { sessionCookie } from "@test/helpers/test-cookies.js";

const { app } = createTestApp();

describe("GET /api/users/me", () => {
  it("returns the authenticated user's public shape", async () => {
    const auth = await authenticateUser({ firstName: "Steve", lastName: "Miner", isAdmin: true });

    const response = await request(app).get("/api/users/me").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: auth.user.id,
      email: auth.user.email,
      firstName: "Steve",
      lastName: "Miner",
      isAdmin: true,
    });
    expect(response.body.createdAt).toBeDefined();
    // The response schema must not leak internal columns.
    expect(response.body.googleId).toBeUndefined();
  });

  it("returns null names when the user has none", async () => {
    const auth = await authenticateUser();

    const response = await request(app).get("/api/users/me").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ firstName: null, lastName: null });
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
