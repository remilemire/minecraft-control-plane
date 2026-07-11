// apps/backend/test/api/minecraft-profiles.api.test.ts

import { randomUUID } from "crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../helpers/create-test-app.js";
import { createMinecraftProfile } from "../helpers/factories/minecraft-profile.factory.js";
import { authenticateAdmin, authenticateUser } from "../helpers/test-auth.js";
import { csrfPair } from "../helpers/test-cookies.js";

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

describe("GET /api/minecraft/profiles", () => {
  it("lists profiles for the admin", async () => {
    const { app } = testApp;
    const admin = await authenticateAdmin();
    const profile = await createMinecraftProfile({ username: "Steve" });

    const response = await request(app)
      .get("/api/minecraft/profiles")
      .set("Cookie", [admin.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: profile.id,
      username: "Steve",
      uuid: profile.uuid,
    });
    // The response schema strips the owning user id.
    expect(response.body[0].userId).toBeUndefined();
  });

  it("rejects non-admin users", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app).get("/api/minecraft/profiles").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ kind: "FORBIDDEN", code: "ADMIN_REQUIRED" });
  });

  it("rejects requests without a session", async () => {
    const { app } = testApp;

    const response = await request(app).get("/api/minecraft/profiles");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("GET /api/minecraft/profiles/me", () => {
  it("returns the caller's profile", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const profile = await createMinecraftProfile({ userId: auth.user.id, username: "Alex" });

    const response = await request(app)
      .get("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: profile.id, username: "Alex", uuid: profile.uuid });
  });

  it("404s when the caller has no profile", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .get("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      kind: "NOT_FOUND",
      code: "MINECRAFT_PROFILE_NOT_FOUND",
    });
  });

  it("only returns the caller's own profile", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    await createMinecraftProfile({ userId: auth.user.id, username: "Mine" });
    // A different user's profile must not be visible here.
    const other = await createMinecraftProfile({ username: "Other" });

    const response = await request(app)
      .get("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body.username).toBe("Mine");
    expect(response.body.id).not.toBe(other.id);
  });
});

describe("PUT /api/minecraft/profiles/me", () => {
  it("stores the uuid and canonical username resolved from the Mojang fake", async () => {
    const { app, mojangClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    const uuid = randomUUID();
    // Mojang knows the account under its canonical casing.
    mojangClient.setProfile({ username: "Steve", uuid });

    const response = await request(app)
      .put("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      // The client submits a differently-cased username.
      .send({ username: "steve" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: expect.any(String),
      username: "Steve",
      uuid,
    });
  });

  it("replaces an existing profile on a second PUT", async () => {
    const { app, mojangClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    await createMinecraftProfile({ userId: auth.user.id, username: "OldName" });
    const newUuid = randomUUID();
    mojangClient.setProfile({ username: "NewName", uuid: newUuid });

    const response = await request(app)
      .put("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "NewName" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ username: "NewName", uuid: newUuid });
  });

  it("404s when Mojang does not know the username", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .put("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Ghost" });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: "NOT_FOUND", code: "MOJANG_PROFILE_NOT_FOUND" });
  });

  it("409s when the username belongs to another user", async () => {
    const { app, mojangClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    // Another user already owns this Minecraft account.
    const taken = await createMinecraftProfile({ username: "Steve" });
    mojangClient.setProfile({ username: "Steve", uuid: taken.uuid });

    const response = await request(app)
      .put("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Steve" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ kind: "CONFLICT", code: "UNIQUE_VIOLATION" });
  });

  it("rejects mutations without the CSRF pair", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .put("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie])
      .send({ username: "Steve" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
  });

  it("rejects an invalid username with a validation error", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .put("/api/minecraft/profiles/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      // Spaces are not allowed by the username regex.
      .send({ username: "not valid" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
    expect(response.body.issues).toEqual([expect.objectContaining({ path: ["username"] })]);
  });
});
