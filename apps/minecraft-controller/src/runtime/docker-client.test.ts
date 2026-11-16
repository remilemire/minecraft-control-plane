import { expect, it, vi } from "vitest";
import { dockerFixture, deferred } from "@test/support/docker-daemon.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import supertest from "supertest";
import { createController } from "@/composition.js";
import { createApp } from "@/http/app.js";
import { createRoutes } from "@/http/routes.js";
it("discovers exactly the configured Compose service through the real Docker transport", async () => {
  const f = await dockerFixture();
  expect(await f.client.getStatus()).toBe("RUNNING");
  const request = f.daemon.requests[0]!;
  expect(request.query.get("all")).toBe("true");
  expect(JSON.parse(request.query.get("filters")!)).toEqual({
    label: ["com.docker.compose.project=test-project", "com.docker.compose.service=minecraft"],
  });
  f.daemon.running = false;
  expect(await f.client.getStatus()).toBe("STOPPED");
});
it("reports a missing container instead of pretending it is stopped", async () => {
  const f = await dockerFixture();
  f.daemon.missing = true;
  await expect(f.client.getStatus()).rejects.toThrow("No container found");
});
it("preserves the missing-container HTTP response through the actual application", async () => {
  const f = await dockerFixture(),
    root = await mkdtemp(join(tmpdir(), "controller-docker-http-")),
    controller = createController({
      dataRoot: root,
      runtime: f.runtime,
      timezone: "UTC",
      retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
    });
  try {
    await controller.initialize();
    const app = createApp({ token: "test", router: createRoutes(controller) });
    f.daemon.missing = true;
    const response = await supertest(app).get("/status").set("authorization", "Bearer test");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: 'No container found for service "minecraft" in project "test-project".',
    });
  } finally {
    await controller.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects ambiguous container identity", async () => {
  const f = await dockerFixture();
  f.daemon.multiple = true;
  await expect(f.client.getStatus()).rejects.toThrow("expected exactly one");
});
it("reads real Docker-framed stdout and stderr logs", async () => {
  const f = await dockerFixture(),
    events = [];
  for await (const event of await f.client.openLogStream(new AbortController().signal))
    events.push(event);
  expect(events).toEqual([
    { stream: "stdout", line: "line one" },
    { stream: "stderr", line: "line two" },
  ]);
  const request = f.daemon.requests.find((r) => r.path.endsWith("/logs"))!;
  expect(request.query.get("tail")).toBe("100");
  expect(request.query.get("follow")).toBe("true");
});
it("does not open a Docker connection for an already aborted read", async () => {
  const f = await dockerFixture(),
    abort = new AbortController();
  abort.abort();
  await expect(f.client.openLogStream(abort.signal)).rejects.toThrow();
  expect(f.daemon.requests).toEqual([]);
});
it("closes the transport if cancellation arrives during discovery", async () => {
  const f = await dockerFixture(),
    abort = new AbortController();
  f.daemon.listHold = deferred();
  const result = expect(f.client.openLogStream(abort.signal)).rejects.toThrow();
  await f.daemon.listEntered.promise;
  abort.abort();
  f.daemon.listHold.resolve();
  await result;
});
it("controller shutdown closes active log transports", async () => {
  const f = await dockerFixture();
  f.daemon.logHold = deferred();
  const events = await f.client.openLogStream(new AbortController().signal);
  expect(events).toBeDefined();
  f.client.closeLogStreams();
  await vi.waitFor(() => expect(f.daemon.closedLogReads).toBe(1));
  f.daemon.logHold.resolve();
});
