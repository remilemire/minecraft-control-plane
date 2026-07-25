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
  it("stores the profile and whitelists the canonical username via the outbox", async () => {
    const { app, mojangClient, rconClient, outboxDispatcher } = testApp;
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
    // The response settles before any RCON runs; the dispatcher applies the
    // whitelist command afterwards.
    expect(rconClient.executed).toEqual([]);
    await outboxDispatcher.tick();
    expect(rconClient.executed).toEqual(["whitelist add Steve"]);
  });

  it("removes the old username and whitelists the new one when a profile is renamed", async () => {
    const { app, mojangClient, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    // First link: OldName is whitelisted.
    mojangClient.setProfile({ username: "OldName", uuid: crypto.randomUUID() });
    await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "OldName" });
    await outboxDispatcher.tick();
    expect(rconClient.executed).toEqual(["whitelist add OldName"]);

    // Rename: the old username is removed and the new one whitelisted, both
    // enqueued atomically with the profile write.
    mojangClient.setProfile({ username: "NewName", uuid: crypto.randomUUID() });
    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "NewName" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ username: "NewName" });

    // The two rename commands share a transaction timestamp, so their relative
    // order isn't guaranteed (and doesn't matter — different usernames).
    await outboxDispatcher.tick();
    expect(rconClient.executed).toHaveLength(3);
    expect(rconClient.executed).toContain("whitelist remove OldName");
    expect(rconClient.executed).toContain("whitelist add NewName");
  });

  it("still succeeds when RCON is down and retries the command with backoff", async () => {
    const { app, mojangClient, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    mojangClient.setProfile({ username: "Steve", uuid: crypto.randomUUID() });
    rconClient.failOn("whitelist add Steve");

    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "steve" });

    // The canonical outbox contract: an RCON outage no longer fails the link.
    expect(response.status).toBe(200);

    // The first tick claims the message and records the failed attempt.
    expect(await outboxDispatcher.tick()).toBe(1);
    expect(rconClient.executed).toEqual(["whitelist add Steve"]);

    // Backoff pushed the retry into the future: an immediate tick claims nothing.
    expect(await outboxDispatcher.tick()).toBe(0);
    expect(rconClient.executed).toEqual(["whitelist add Steve"]);
  });

  it("404s when Mojang does not know the username", async () => {
    const { app, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .put("/api/minecraft/players/me")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Ghost" });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: "NOT_FOUND", code: "MOJANG_PROFILE_NOT_FOUND" });
    // Nothing was enqueued: even after a dispatcher tick, no whitelist command runs.
    await outboxDispatcher.tick();
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
  it("removes the target user's profile and unwhitelists it via the outbox", async () => {
    const { app, rconClient, outboxDispatcher } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();
    const target = await authenticateUser();
    await createMinecraftProfile({ userId: target.user.id, username: "Notch" });

    const response = await request(app)
      .delete(`/api/minecraft/players/${target.user.id}`)
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(rconClient.executed).toEqual([]);
    await outboxDispatcher.tick();
    expect(rconClient.executed).toEqual(["whitelist remove Notch"]);

    const afterDelete = await request(app)
      .get("/api/minecraft/players/me")
      .set("Cookie", [target.cookie]);
    expect(afterDelete.status).toBe(404);
  });

  it("404s when the target user has no profile", async () => {
    const { app, rconClient, outboxDispatcher } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();
    const target = await authenticateUser();

    const response = await request(app)
      .delete(`/api/minecraft/players/${target.user.id}`)
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "MINECRAFT_PROFILE_NOT_FOUND" });
    await outboxDispatcher.tick();
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
    const { app, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    await createMinecraftProfile({ userId: auth.user.id, username: "Notch" });

    const response = await request(app)
      .delete(`/api/minecraft/players/${auth.user.id}`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "ADMIN_REQUIRED" });
    await outboxDispatcher.tick();
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
