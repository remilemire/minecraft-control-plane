import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { StartupGate } from "./startup-gate.js";
const roots: string[] = [];
const gates: StartupGate[] = [];
afterEach(async () => {
  await Promise.all(gates.splice(0).map((gate) => gate.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "startup-gate-"));
  roots.push(root);
  const inspect = vi.fn(async () => ({
    containerId: "expected-container",
    hostname: "minecraft-host",
    running: true,
    env: {},
    restartPolicy: { Name: "no" },
  }));
  const gate = new StartupGate(root, { inspect });
  gates.push(gate);
  await gate.initialize();
  const request = (host = "minecraft-host") => `${host}\n${randomUUID()}\n`;
  const put = (value: string) => writeFile(join(root, "requests/current"), value);
  const permit = () => readFile(join(root, "permits/current"), "utf8");
  return { root, gate, inspect, request, put, permit };
}
it("starts blocked, then authorizes only the fresh request", async () => {
  const { gate, request, put, permit } = await fixture();
  const first = request();
  await put(first);
  await expect(permit()).rejects.toThrow();
  await gate.open();
  await vi.waitFor(async () => expect(await permit()).toBe(first));
  const second = request();
  await put(second);
  expect(await permit()).not.toBe(second);
  await vi.waitFor(async () => expect(await permit()).toBe(second));
  await gate.block();
  await expect(permit()).rejects.toThrow();
});
it("rejects wrong-container requests and Docker unavailability", async () => {
  const { gate, request, put, inspect, permit } = await fixture();
  await gate.open();
  await put(request("unmanaged"));
  await new Promise((resolve) => setTimeout(resolve, 250));
  await expect(permit()).rejects.toThrow();
  inspect.mockRejectedValue(new Error("Docker offline"));
  await put(request());
  await new Promise((resolve) => setTimeout(resolve, 250));
  await expect(permit()).rejects.toThrow();
});
it("limits workflow startup to the recorded container and revokes permission afterward", async () => {
  const { gate, request, put, permit } = await fixture();
  const value = request();
  await put(value);
  await gate.boot("different-container", async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(permit()).rejects.toThrow();
  });
  await gate.boot("expected-container", async () => {
    await vi.waitFor(async () => expect(await permit()).toBe(value));
  });
  await expect(permit()).rejects.toThrow();
});
