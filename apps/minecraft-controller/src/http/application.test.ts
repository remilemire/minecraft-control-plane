import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import supertest from "supertest";
import { fixture, backup, authorization } from "@test/support/controller.js";
it("protects the real application routes with its bearer token", async () => {
  const f = await fixture();
  expect((await supertest(f.app).post("/start")).status).toBe(401);
  expect((await supertest(f.app).get("/status").set("authorization", "Bearer wrong")).status).toBe(
    401,
  );
  expect(f.runtime.calls).toEqual([]);
});
it("validates malformed JSON and command bodies before execution", async () => {
  const f = await fixture();
  for (const command of ["", "line\nsecond", "nul\0byte"]) {
    expect(
      (await supertest(f.app).post("/rcon").set("authorization", authorization).send({ command }))
        .status,
    ).toBe(400);
  }
  expect(
    (
      await supertest(f.app)
        .post("/backups")
        .set("authorization", authorization)
        .send({ requestId: "bad" })
    ).status,
  ).toBe(400);
  expect(f.runtime.commands).toEqual([]);
});
it("executes console commands and returns real runtime errors through the service", async () => {
  const f = await fixture();
  expect(
    (
      await supertest(f.app)
        .post("/rcon")
        .set("authorization", authorization)
        .send({ command: "list" })
    ).body.output,
  ).toContain("players online");
  expect(f.runtime.commands).toContain("list");
  await f.controller.server.power("stop");
  expect(
    (
      await supertest(f.app)
        .post("/rcon")
        .set("authorization", authorization)
        .send({ command: "list" })
    ).status,
  ).toBe(500);
});
it("supports both operation/recovery URLs and has no migration endpoint", async () => {
  const f = await fixture();
  await backup(f.controller);
  const id = f.controller.maintenance.latestOperation()!.id;
  for (const prefix of ["/maintenance", "/backups"]) {
    const response = await supertest(f.app)
      .get(prefix + "/operations/" + id)
      .set("authorization", authorization);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
    expect(
      (
        await supertest(f.app)
          .post(prefix + "/recover")
          .set("authorization", authorization)
      ).status,
    ).toBe(204);
  }
  expect(
    (
      await supertest(f.app)
        .post("/backups/migrate")
        .set("authorization", authorization)
        .send({ requestId: randomUUID() })
    ).status,
  ).toBe(404);
});
