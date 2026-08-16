// apps/backend/test/api/minecraft-console.api.test.ts

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/helpers/create-test-app.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { csrfPair } from "@test/helpers/test-cookies.js";

let testApp: TestApp;

beforeEach(() => {
  testApp = createTestApp();
});

describe("GET /api/minecraft/server/console/logs", () => {
  it("streams structured log lines as Server-Sent Events", async () => {
    const { app, processClient } = testApp;
    processClient.logEvents = [
      { stream: "stdout", line: 'Done (3.421s)! For help, type "help"' },
      { stream: "stderr", line: "A warning" },
    ];
    const auth = await authenticateUser();

    const response = await request(app)
      .get("/api/minecraft/server/console/logs")
      .set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(response.text).toBe(
      'event: log\ndata: {"stream":"stdout","line":"Done (3.421s)! For help, type \\"help\\""}\n\n' +
        'event: log\ndata: {"stream":"stderr","line":"A warning"}\n\n',
    );
  });

  it("requires a session", async () => {
    const response = await request(testApp.app).get("/api/minecraft/server/console/logs");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("POST /api/minecraft/server/console/commands", () => {
  it("executes the validated command over RCON", async () => {
    const { app, rconClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/minecraft/server/console/commands")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ command: "  say Hello world  " });

    expect(response.status).toBe(204);
    expect(rconClient.executed).toEqual(["say Hello world"]);
  });

  it("rejects an empty command", async () => {
    const { app, rconClient } = testApp;
    const auth = await authenticateUser();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/minecraft/server/console/commands")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ command: "   " });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(rconClient.executed).toEqual([]);
  });

  it("requires the CSRF pair", async () => {
    const { app, rconClient } = testApp;
    const auth = await authenticateUser();

    const response = await request(app)
      .post("/api/minecraft/server/console/commands")
      .set("Cookie", [auth.cookie])
      .send({ command: "say Hello world" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
    expect(rconClient.executed).toEqual([]);
  });
});
