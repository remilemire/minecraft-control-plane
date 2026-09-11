// apps/backend/test/api/minecraft-server.api.test.ts

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/helpers/create-test-app.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { csrfPair } from "@test/helpers/test-cookies.js";

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

describe("GET /api/minecraft/server/status", () => {
  it("reports the process client status", async () => {
    const { app, processClient } = testApp;
    processClient.status = "STOPPED";
    const auth = await authenticateUser();

    const response = await request(app)
      .get("/api/minecraft/server/status")
      .set("Cookie", [auth.cookie]);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({ status: "STOPPED", maintenance: null });
  });

  it("requires a session", async () => {
    const { app } = testApp;

    const response = await request(app).get("/api/minecraft/server/status");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("POST /api/minecraft/server/{start,stop,restart}", () => {
  it.each([
    ["start", "start"],
    ["stop", "stop"],
    ["restart", "restart"],
  ])("drives the process client for %s and responds 204", async (route, call) => {
    const { app, processClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post(`/api/minecraft/server/${route}`)
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue);

    expect(response.status).toBe(204);
    expect(processClient.calls).toEqual([call]);
  });

  it("requires the CSRF pair", async () => {
    const { app, processClient } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .post("/api/minecraft/server/start")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
    expect(processClient.calls).toEqual([]);
  });

  it("requires a session", async () => {
    const { app } = testApp;

    const response = await request(app).post("/api/minecraft/server/start");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
