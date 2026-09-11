import request from "supertest";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "@test/helpers/create-test-app.js";
import { authenticateUser } from "@test/helpers/test-auth.js";
import { csrfPair } from "@test/helpers/test-cookies.js";

let testApp: TestApp;
beforeEach(() => {
  testApp = createTestApp();
});
describe("Minecraft backups API", () => {
  it("requires authentication for listing and schedule access", async () => {
    for (const path of [
      "",
      "/schedules",
      `/${randomUUID()}/restore-preview`,
      `/operations/${randomUUID()}`,
    ])
      expect((await request(testApp.app).get(`/api/minecraft/backups${path}`)).status).toBe(401);
  });
  it("lets a non-owner list backups and create a manual backup", async () => {
    const auth = await authenticateUser({ isOwner: false });
    const csrf = csrfPair();
    expect(
      (await request(testApp.app).get("/api/minecraft/backups").set("Cookie", auth.cookie)).body,
    ).toEqual(testApp.backupsClient.data);
    const requestId = randomUUID();
    const response = await request(testApp.app)
      .post("/api/minecraft/backups")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ requestId });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ operationId: requestId });
    expect(testApp.backupsClient.calls).toEqual(["create"]);
  });
  it("requires CSRF for creation, schedule changes, restore, and deletion", async () => {
    const auth = await authenticateUser();
    const id = randomUUID();
    const requests = [
      request(testApp.app).post("/api/minecraft/backups"),
      request(testApp.app).put("/api/minecraft/backups/schedules"),
      request(testApp.app).post(`/api/minecraft/backups/${id}/restore`),
      request(testApp.app).delete(`/api/minecraft/backups/${id}`),
    ];
    for (const attempt of requests)
      expect((await attempt.set("Cookie", auth.cookie).send({ requestId: id })).status).toBe(403);
    expect(testApp.backupsClient.calls).toEqual([]);
  });
  it("validates request IDs and rejects unknown scheduling fields", async () => {
    const auth = await authenticateUser();
    const csrf = csrfPair();
    const invalid = await request(testApp.app)
      .post("/api/minecraft/backups")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ requestId: "../../data", path: "/etc" });
    expect(invalid.status).toBe(422);
    const schedule = await request(testApp.app)
      .put("/api/minecraft/backups/schedules")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ hourly: true, daily: false, weekly: false, monthly: false, cap: 999 });
    expect(schedule.status).toBe(422);
    expect(testApp.backupsClient.calls).toEqual([]);
  });
  it("updates each schedule independently without changing retention", async () => {
    const auth = await authenticateUser();
    const csrf = csrfPair();
    const enabled = { hourly: true, daily: false, weekly: true, monthly: true };
    const response = await request(testApp.app)
      .put("/api/minecraft/backups/schedules")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send(enabled);
    expect(response.status).toBe(200);
    expect(response.body.enabled).toEqual(enabled);
    expect(response.body.retention).toEqual({ hourly: 6, daily: 5, weekly: 3, monthly: 2 });
  });
});
