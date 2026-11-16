import { expect, it, vi } from "vitest";
import supertest from "supertest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, authorization } from "@test/support/controller.js";
it("runs the complete HTTP start path and waits for authorized RCON readiness", async () => {
  const f = await fixture({ running: false });
  const hold = f.runtime.holdReady();
  let finished = false;
  const request = supertest(f.app)
    .post("/start")
    .set("authorization", authorization)
    .then((response) => {
      finished = true;
      return response;
    });
  await vi.waitFor(() => expect(f.runtime.upstreamStarts).toBe(1));
  expect(finished).toBe(false);
  expect(await readFile(join(f.root, "startup-gate/permits/current"), "utf8")).toBe(
    await readFile(join(f.root, "startup-gate/requests/current"), "utf8"),
  );
  hold.resolve(undefined);
  expect((await request).status).toBe(204);
  expect(f.runtime.state.running).toBe(true);
  expect(f.controller.maintenance.latestOperation()?.status).toBe("succeeded");
});
it("stops and restarts through real services and durable tasks", async () => {
  const f = await fixture();
  expect((await supertest(f.app).post("/stop").set("authorization", authorization)).status).toBe(
    204,
  );
  expect(f.runtime.state.running).toBe(false);
  expect((await supertest(f.app).post("/restart").set("authorization", authorization)).status).toBe(
    204,
  );
  expect(f.runtime.javaRunning).toBe(true);
  expect(f.runtime.calls).toContain("start");
  expect(f.runtime.calls).toContain("ready");
  expect(f.runtime.state.restartPolicy.Name).toBe("unless-stopped");
});
it("rejects competing writes, retains status/log reads, and fences direct starts", async () => {
  const f = await fixture();
  const stop = f.runtime.holdStop();
  const request = supertest(f.app)
    .post("/restart")
    .set("authorization", authorization)
    .then((r) => r);
  await vi.waitFor(() => expect(f.runtime.state.running).toBe(false));
  await f.runtime.start();
  await new Promise((r) => setTimeout(r, 250));
  expect(f.runtime.upstreamStarts).toBe(0);
  expect(
    (
      await supertest(f.app)
        .post("/rcon")
        .set("authorization", authorization)
        .send({ command: "whitelist add Test" })
    ).status,
  ).toBe(409);
  expect((await supertest(f.app).get("/status").set("authorization", authorization)).status).toBe(
    200,
  );
  expect((await supertest(f.app).get("/logs").set("authorization", authorization)).text).toContain(
    "Minecraft test log",
  );
  const stopping = f.runtime.stop();
  stop.resolve(undefined);
  await stopping;
  expect((await request).status).toBe(204);
});
it("propagates a failed start instead of reporting success", async () => {
  const f = await fixture({ running: false });
  f.runtime.readinessFailures = 1;
  const response = await supertest(f.app).post("/start").set("authorization", authorization);
  expect(response.status).toBe(503);
  expect(f.controller.maintenance.latestOperation()?.status).toBe("failed");
  expect(f.runtime.state.running).toBe(false);
});
it("drains an admitted task on shutdown and leaves subsequent direct boots fenced", async () => {
  const f = await fixture(),
    hold = f.runtime.holdStop();
  const request = supertest(f.app)
    .post("/restart")
    .set("authorization", authorization)
    .then((response) => response);
  await vi.waitFor(() => expect(f.runtime.state.running).toBe(false));
  let closed = false;
  const closing = f.controller.close().then(() => {
    closed = true;
  });
  expect(closed).toBe(false);
  await expect(f.controller.server.execute("list")).rejects.toMatchObject({
    code: "BACKUP_CONTROLLER_ERROR",
  });
  hold.resolve(undefined);
  expect((await request).status).toBe(204);
  await closing;
  expect(f.runtime.javaRunning).toBe(true);
  await f.runtime.stop();
  await f.runtime.start();
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(f.runtime.javaRunning).toBe(false);
  await expect(f.controller.initialize()).rejects.toThrow("shutting down");
});
