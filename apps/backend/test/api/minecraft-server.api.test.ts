// apps/backend/test/api/minecraft-server.api.test.ts

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

describe("GET /api/minecraft/server/status", () => {
  it("reports the process client status", async () => {
    const { app, processClient } = testApp;
    processClient.status = "STOPPED";
    const admin = await authenticateAdmin();

    const response = await request(app)
      .get("/api/minecraft/server/status")
      .set("Cookie", [admin.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toBe("STOPPED");
  });

  it("requires an admin session", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .get("/api/minecraft/server/status")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "ADMIN_REQUIRED" });
  });
});

describe("GET /api/minecraft/server/players", () => {
  it("returns the rcon list output", async () => {
    const { app, rconClient } = testApp;
    rconClient.respondTo("list", "There are 2 of a max of 20 players online: Steve, Alex");
    const admin = await authenticateAdmin();

    const response = await request(app)
      .get("/api/minecraft/server/players")
      .set("Cookie", [admin.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toBe("There are 2 of a max of 20 players online: Steve, Alex");
    expect(rconClient.executed).toEqual(["list"]);
  });
});

describe("PUT/DELETE /api/minecraft/server/whitelist/:userId", () => {
  it("whitelists the user's profile username via rcon", async () => {
    const { app, rconClient } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();
    const profile = await createMinecraftProfile({ username: "Notch" });

    const response = await request(app)
      .put(`/api/minecraft/server/whitelist/${profile.userId}`)
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(rconClient.executed).toEqual(["whitelist add Notch"]);
  });

  it("removes the user's profile username via rcon", async () => {
    const { app, rconClient } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();
    const profile = await createMinecraftProfile({ username: "Notch" });

    const response = await request(app)
      .delete(`/api/minecraft/server/whitelist/${profile.userId}`)
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(rconClient.executed).toEqual(["whitelist remove Notch"]);
  });

  it("404s when the target user has no profile", async () => {
    const { app, rconClient } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();

    const response = await request(app)
      .put(`/api/minecraft/server/whitelist/${randomUUID()}`)
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
      .put("/api/minecraft/server/whitelist/not-a-uuid")
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
  });

  it("rejects a non-admin even with a valid CSRF pair", async () => {
    const { app } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .put(`/api/minecraft/server/whitelist/${randomUUID()}`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "ADMIN_REQUIRED" });
  });
});

describe("POST /api/minecraft/server/{start,stop,restart}", () => {
  it.each([
    ["start", "start"],
    ["stop", "stop"],
    ["restart", "restart"],
  ])("drives the process client for %s and responds 204", async (route, call) => {
    const { app, processClient } = testApp;
    const admin = await authenticateAdmin();
    const csrf = csrfPair();

    const response = await request(app)
      .post(`/api/minecraft/server/${route}`)
      .set("Cookie", [admin.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(processClient.calls).toEqual([call]);
  });

  it("requires the CSRF pair", async () => {
    const { app, processClient } = testApp;
    const admin = await authenticateAdmin();

    const response = await request(app)
      .post("/api/minecraft/server/start")
      .set("Cookie", [admin.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
    expect(processClient.calls).toEqual([]);
  });

  it("requires an admin session", async () => {
    const { app, processClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/minecraft/server/start")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "ADMIN_REQUIRED" });
    expect(processClient.calls).toEqual([]);
  });

  it("requires a session", async () => {
    const { app } = testApp;

    const response = await request(app).post("/api/minecraft/server/start");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
