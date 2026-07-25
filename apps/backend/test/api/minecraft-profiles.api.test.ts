// apps/backend/test/api/minecraft-profiles.api.test.ts

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/helpers/create-test-app.js";
import { createMinecraftProfile } from "@test/helpers/factories/minecraft-profile.factory.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { csrfPair } from "@test/helpers/test-cookies.js";

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

describe("GET /api/minecraft/profiles", () => {
  it("lists every whitelisted profile with their online status", async () => {
    const { app, rconClient } = testApp;
    rconClient.respondTo("list", "There are 1 of a max of 20 players online: Steve");
    const auth = await authenticateUser();
    const online = await createMinecraftProfile({ username: "Steve" });
    const offline = await createMinecraftProfile({ username: "Alex" });

    const response = await request(app).get("/api/minecraft/profiles").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body).toContainEqual({
      id: online.id,
      username: "Steve",
      uuid: online.uuid,
      online: true,
    });
    expect(response.body).toContainEqual({
      id: offline.id,
      username: "Alex",
      uuid: offline.uuid,
      online: false,
    });
  });

  it("rejects requests without a session", async () => {
    const { app } = testApp;

    const response = await request(app).get("/api/minecraft/profiles");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("POST /api/minecraft/profiles", () => {
  it("stores the canonical Mojang profile and whitelists it via the outbox", async () => {
    const { app, mojangClient, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    mojangClient.setProfile({ username: "Steve", uuid: crypto.randomUUID() });

    const response = await request(app)
      .post("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      // The client submits a differently-cased username.
      .send({ username: "steve" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ username: "Steve", online: false });
    expect(response.body.id).toBeDefined();
    // The response settles before any RCON runs; the dispatcher applies the
    // whitelist command afterwards.
    expect(rconClient.executed).toEqual([]);
    await outboxDispatcher.tick();
    expect(rconClient.executed).toEqual(["whitelist add Steve"]);
  });

  it("still succeeds when RCON is down and retries the command with backoff", async () => {
    const { app, mojangClient, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    mojangClient.setProfile({ username: "Steve", uuid: crypto.randomUUID() });
    rconClient.failOn("whitelist add Steve");

    const response = await request(app)
      .post("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "steve" });

    // The canonical outbox contract: an RCON outage no longer fails the request.
    expect(response.status).toBe(201);

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
      .post("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Ghost" });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: "NOT_FOUND", code: "MOJANG_PROFILE_NOT_FOUND" });
    // Nothing was enqueued: even after a dispatcher tick, no whitelist command runs.
    await outboxDispatcher.tick();
    expect(rconClient.executed).toEqual([]);
  });

  it("409s when the username is already whitelisted", async () => {
    const { app, mojangClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    await createMinecraftProfile({ username: "Steve" });
    mojangClient.setProfile({ username: "Steve", uuid: crypto.randomUUID() });

    const response = await request(app)
      .post("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Steve" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ kind: "CONFLICT", code: "MINECRAFT_USERNAME_TAKEN" });
  });

  it("409s when the account is already whitelisted under another name", async () => {
    const { app, mojangClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    const existing = await createMinecraftProfile({ username: "Steve" });
    // Mojang resolves a different username to the already-stored account.
    mojangClient.setProfile({ username: "Alex", uuid: existing.uuid });

    const response = await request(app)
      .post("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Alex" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ kind: "CONFLICT", code: "MINECRAFT_ACCOUNT_TAKEN" });
  });

  it("rejects mutations without the CSRF pair", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .post("/api/minecraft/profiles")
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
      .post("/api/minecraft/profiles")
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
      .post("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Steve", uuid: "not-allowed" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
  });
});

describe("DELETE /api/minecraft/profiles/:minecraftProfileId", () => {
  it("removes the profile and unwhitelists it via the outbox", async () => {
    const { app, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    const profile = await createMinecraftProfile({ username: "Notch" });

    const response = await request(app)
      .delete(`/api/minecraft/profiles/${profile.id}`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(rconClient.executed).toEqual([]);
    await outboxDispatcher.tick();
    expect(rconClient.executed).toEqual(["whitelist remove Notch"]);

    const afterDelete = await request(app)
      .get("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie]);
    expect(afterDelete.body).toEqual([]);
  });

  it("404s for an unknown profile id", async () => {
    const { app, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .delete(`/api/minecraft/profiles/${crypto.randomUUID()}`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "MINECRAFT_PROFILE_NOT_FOUND" });
    await outboxDispatcher.tick();
    expect(rconClient.executed).toEqual([]);
  });

  it("422s when the id is not a uuid", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .delete("/api/minecraft/profiles/not-a-uuid")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
  });

  it("rejects mutations without the CSRF pair", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const profile = await createMinecraftProfile();

    const response = await request(app)
      .delete(`/api/minecraft/profiles/${profile.id}`)
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
  });

  it("converges when a username is deleted and re-added before dispatch", async () => {
    const { app, mojangClient, rconClient, outboxDispatcher } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();
    const original = await createMinecraftProfile({ username: "Steve" });

    // Delete the profile (enqueues a remove), then re-add the same username
    // as a new profile (enqueues an add) before the dispatcher runs.
    await request(app)
      .delete(`/api/minecraft/profiles/${original.id}`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);
    mojangClient.setProfile({ username: "Steve", uuid: crypto.randomUUID() });
    await request(app)
      .post("/api/minecraft/profiles")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ username: "Steve" });

    await outboxDispatcher.tick();

    // The older remove no-ops (the username has a current owner again); only
    // the add executes. The whitelist converges to the current state.
    expect(rconClient.executed).toEqual(["whitelist add Steve"]);
  });
});
