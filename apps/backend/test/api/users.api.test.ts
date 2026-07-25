// apps/backend/test/api/users.api.test.ts

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "@test/helpers/create-test-app.js";
import { createSession } from "@test/helpers/factories/session.factory.js";
import { createUser } from "@test/helpers/factories/user.factory.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { sessionCookie } from "@test/helpers/test-cookies.js";

const { app } = createTestApp();

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
      expect(Object.keys(user).sort()).toEqual(["id", "email", "fullName", "createdAt"].sort());
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
    expect(Object.keys(response.body).sort()).toEqual(
      ["id", "email", "fullName", "createdAt"].sort(),
    );
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
