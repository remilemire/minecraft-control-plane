// apps/backend/test/api/minecraft-players.api.test.ts

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/helpers/create-test-app.js";
import { createMinecraftProfile } from "@test/helpers/factories/minecraft-profile.factory.js";
import { authenticateAdmin, authenticateUser } from "@test/helpers/test-auth.js";
import { csrfPair } from "@test/helpers/test-cookies.js";

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

describe("GET /api/minecraft/players", () => {
  it("lists every linked player with their online status", async () => {
    const { app, rconClient } = testApp;
    rconClient.respondTo("list", "There are 1 of a max of 20 players online: Steve");
    const admin = await authenticateAdmin();
    const online = await createMinecraftProfile({ username: "Steve" });
    const offline = await createMinecraftProfile({ username: "Alex" });

    const response = await request(app).get("/api/minecraft/players").set("Cookie", [admin.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body).toContainEqual({
      userId: online.userId,
      username: "Steve",
      uuid: online.uuid,
      online: true,
    });
    expect(response.body).toContainEqual({
      userId: offline.userId,
      username: "Alex",
      uuid: offline.uuid,
      online: false,
    });
  });

  it("rejects non-admin users", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app).get("/api/minecraft/players").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ kind: "FORBIDDEN", code: "ADMIN_REQUIRED" });
  });

  it("rejects requests without a session", async () => {
    const { app } = testApp;

    const response = await request(app).get("/api/minecraft/players");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("GET /api/minecraft/players/me", () => {
  it("returns the caller's player with their online status", async () => {
    const { app, rconClient } = testApp;
    rconClient.respondTo("list", "There are 1 of a max of 20 players online: Alex");
    const auth = await authenticateUser();
    const profile = await createMinecraftProfile({ userId: auth.user.id, username: "Alex" });

    const response = await request(app)
      .get("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      userId: profile.userId,
      username: "Alex",
      uuid: profile.uuid,
      online: true,
    });
  });

  it("404s when the caller has no profile", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .get("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      kind: "NOT_FOUND",
      code: "MINECRAFT_PROFILE_NOT_FOUND",
    });
  });

  it("only returns the caller's own player", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    await createMinecraftProfile({ userId: auth.user.id, username: "Mine" });
    // A different user's profile must not be visible here.
    await createMinecraftProfile({ username: "Other" });

    const response = await request(app)
      .get("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body.username).toBe("Mine");
    expect(response.body.userId).toBe(auth.user.id);
  });
});

describe("PUT /api/minecraft/players/me", () => {
  it("stores the profile and whitelists the canonical username via rcon", async () => {
    const { app, mojangClient, rconClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    mojangClient.setProfile({ username: "Steve", uuid: crypto.randomUUID() });

    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      // The client submits a differently-cased username.
      .send({ username: "steve" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ username: "Steve", online: false });
    expect(rconClient.executed).toEqual(["whitelist add Steve"]);
  });

  it("replaces an existing profile and re-whitelists the new username on a second PUT", async () => {
    const { app, mojangClient, rconClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    await createMinecraftProfile({ userId: auth.user.id, username: "OldName" });
    mojangClient.setProfile({ username: "NewName", uuid: crypto.randomUUID() });

    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "NewName" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ username: "NewName" });
    expect(rconClient.executed).toEqual(["whitelist add NewName"]);
  });

  it("404s when Mojang does not know the username", async () => {
    const { app, rconClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Ghost" });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: "NOT_FOUND", code: "MOJANG_PROFILE_NOT_FOUND" });
    // No whitelist command should run when the Mojang lookup fails.
    expect(rconClient.executed).toEqual([]);
  });

  it("409s when the username belongs to another user", async () => {
    const { app, mojangClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    // Another user already owns this Minecraft account.
    const taken = await createMinecraftProfile({ username: "Steve" });
    mojangClient.setProfile({ username: "Steve", uuid: taken.uuid });

    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Steve" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ kind: "CONFLICT", code: "MINECRAFT_USERNAME_TAKEN" });
  });

  it("rejects mutations without the CSRF pair", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .put("/api/minecraft/players/me")
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
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      // Spaces are not allowed by the username regex.
      .send({ username: "not valid" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
    expect(response.body.issues).toEqual([expect.objectContaining({ path: ["username"] })]);
  });

  it("rejects unknown fields", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Steve", isAdmin: true });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
  });
});

describe("DELETE /api/minecraft/players/:userId", () => {
  it("removes the target user's profile and unwhitelists it via rcon", async () => {
    const { app, rconClient } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();
    const target = await authenticateUser();
    await createMinecraftProfile({ userId: target.user.id, username: "Notch" });

    const response = await request(app)
      .delete(`/api/minecraft/players/${target.user.id}`)
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(rconClient.executed).toEqual(["whitelist remove Notch"]);

    const afterDelete = await request(app)
      .get("/api/minecraft/players/me")
      .set("Cookie", [target.cookie]);
    expect(afterDelete.status).toBe(404);
  });

  it("404s when the target user has no profile", async () => {
    const { app, rconClient } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();
    const target = await authenticateUser();

    const response = await request(app)
      .delete(`/api/minecraft/players/${target.user.id}`)
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "MINECRAFT_PROFILE_NOT_FOUND" });
    expect(rconClient.executed).toEqual([]);
  });

  it("422s when the userId is not a uuid", async () => {
    const { app } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();

    const response = await request(app)
      .delete("/api/minecraft/players/not-a-uuid")
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
  });

  it("rejects a non-admin even for their own profile", async () => {
    const { app, rconClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    await createMinecraftProfile({ userId: auth.user.id, username: "Notch" });

    const response = await request(app)
      .delete(`/api/minecraft/players/${auth.user.id}`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(rconClient.executed).toEqual([]);
  });

  it("rejects mutations without the CSRF pair", async () => {
    const { app } = testApp;
    const admin = await authenticateAdmin();
    const target = await authenticateUser();

    const response = await request(app)
      .delete(`/api/minecraft/players/${target.user.id}`)
      .set("Cookie", [admin.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
  });
});
