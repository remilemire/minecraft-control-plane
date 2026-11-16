import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import supertest from "supertest";
import { fixture, takeBackup } from "@/backups/test-fixtures.js";
import type { ControllerApplication } from "@/composition.js";
import { createApp } from "./app.js";
import { createRoutes } from "./routes.js";
const roots: string[] = [];
const applications: ControllerApplication[] = [];
afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const authorization = "Bearer test";
it("shares admission across backup, power and RCON while reads remain available", async () => {
  let release: () => void = () => {};
  let reached: () => void = () => {};
  const paused = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { controller, root, runtime } = await fixture({
    observer: async (op, event) => {
      if (op.kind === "backup" && event === "admitted") {
        reached();
        await resume;
      }
    },
  });
  roots.push(root);
  applications.push(controller);
  const app = createApp({ router: createRoutes(controller), token: "test" });
  const requestId = randomUUID();
  const accepted = await supertest(app)
    .post("/backups")
    .set("authorization", authorization)
    .send({ requestId });
  expect(accepted.status).toBe(202);
  await paused;
  try {
    const duplicate = await supertest(app)
      .post("/backups")
      .set("authorization", authorization)
      .send({ requestId });
    expect(duplicate.body).toEqual(accepted.body);
    for (const [path, body] of [
      ["/start", {}],
      ["/rcon", { command: "whitelist add Test" }],
    ] as const) {
      const response = await supertest(app)
        .post(path)
        .set("authorization", authorization)
        .send(body);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("MINECRAFT_MAINTENANCE");
    }
    expect((await supertest(app).get("/status").set("authorization", authorization)).status).toBe(
      200,
    );
    for (const prefix of ["/maintenance", "/backups"]) {
      const response = await supertest(app)
        .get(prefix + "/operations/" + requestId)
        .set("authorization", authorization);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("running");
    }
    expect(runtime.commands).not.toContain("whitelist add Test");
  } finally {
    release();
  }
  await controller.maintenance.wait();
});
it("retires the migration endpoint and exposes recovery under both URLs", async () => {
  const { controller, root } = await fixture();
  roots.push(root);
  applications.push(controller);
  const app = createApp({ router: createRoutes(controller), token: "test" });
  expect(
    (
      await supertest(app)
        .post("/backups/migrate")
        .set("authorization", authorization)
        .send({ requestId: randomUUID() })
    ).status,
  ).toBe(404);
  for (const prefix of ["/maintenance", "/backups"])
    expect(
      (
        await supertest(app)
          .post(prefix + "/recover")
          .set("authorization", authorization)
      ).status,
    ).toBe(204);
  await takeBackup(controller.backups, controller.maintenance);
});
