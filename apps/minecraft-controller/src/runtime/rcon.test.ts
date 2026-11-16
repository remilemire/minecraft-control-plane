import { afterEach, expect, it, vi } from "vitest";
import { dockerFixture, deferred } from "@test/support/docker-daemon.js";
afterEach(() => vi.useRealTimers());
it("executes through real Docker HTTP and preserves command arguments and fragmented UTF-8", async () => {
  const f = await dockerFixture(),
    bytes = Buffer.from("héllo");
  f.daemon.plans.push({
    frames: [
      { stream: 1, data: bytes.subarray(0, 2) },
      { stream: 1, data: bytes.subarray(2) },
      { stream: 2, data: " warning" },
    ],
  });
  expect(await f.runtime.execute("say $HOME; `literal`", 9)).toBe("héllo warning");
  const request = f.daemon.requests.find((r) => r.path.endsWith("/exec"));
  expect(request?.body).toMatchObject({
    Cmd: [
      "timeout",
      "--signal=KILL",
      "9",
      "rcon-cli",
      "--config",
      "/data/.rcon-cli.yaml",
      "--",
      "say $HOME; `literal`",
    ],
    WorkingDir: "/data",
    Tty: false,
  });
});
it("serializes real remote execs and continues after a nonzero exit", async () => {
  const f = await dockerFixture(),
    hold = deferred();
  f.daemon.plans.push(
    { frames: [{ stream: 2, data: "failed" }], exitCode: 1, hold },
    { frames: [{ stream: 1, data: "next result" }] },
  );
  const first = expect(f.runtime.execute("first")).rejects.toMatchObject({
    code: "BACKUP_CONTROLLER_ERROR",
  });
  await vi.waitFor(() => expect(f.daemon.started).toHaveLength(1));
  const second = f.runtime.execute("second");
  await new Promise((r) => setTimeout(r, 20));
  expect(f.daemon.requests.filter((r) => r.path.endsWith("/exec"))).toHaveLength(1);
  hold.resolve();
  await first;
  expect(await second).toBe("next result");
  expect(f.daemon.started).toHaveLength(2);
});
it("rejects remote output beyond its limit", async () => {
  const f = await dockerFixture();
  f.daemon.plans.push({ frames: [{ stream: 1, data: Buffer.alloc(1024 * 1024 + 1, 65) }] });
  await expect(f.runtime.execute("large")).rejects.toThrow("limit");
});
it("bounds a stalled transport and allows the following command", { timeout: 10000 }, async () => {
  const f = await dockerFixture(),
    hold = deferred();
  f.daemon.plans.push({ hold }, { frames: [{ stream: 1, data: "recovered" }] });
  const result = expect(f.runtime.execute("stalled", 0.01)).rejects.toThrow("timed out");
  await result;
  hold.resolve();
  expect(await f.runtime.execute("next")).toBe("recovered");
});
it("verifies actual RCON responses for readiness and saving controls", async () => {
  const f = await dockerFixture();
  f.daemon.plans.push(
    { frames: [{ stream: 1, data: "There are 3 of a max of 20 players online:" }] },
    { frames: [{ stream: 1, data: "Automatic saving is now disabled" }] },
    { frames: [{ stream: 1, data: "Saved the game" }] },
    { frames: [{ stream: 1, data: "Automatic saving is now enabled" }] },
  );
  expect(await f.runtime.players()).toBe(3);
  await f.runtime.saving(false);
  await f.runtime.flush();
  await f.runtime.saving(true);
  expect(f.daemon.requests.filter((r) => r.path.endsWith("/exec"))).toHaveLength(4);
});
it("refuses unrecognized player counts and unconfirmed saving changes", async () => {
  const f = await dockerFixture();
  f.daemon.plans.push(
    { frames: [{ stream: 1, data: "unknown format" }] },
    { frames: [{ stream: 1, data: "unknown command" }] },
  );
  await expect(f.runtime.players()).rejects.toMatchObject({ code: "BACKUP_CONTROLLER_ERROR" });
  await expect(f.runtime.saving(false)).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
});
it("checks readiness through the actual transport", async () => {
  const f = await dockerFixture();
  await f.runtime.waitReady();
  expect(f.daemon.requests.some((r) => r.path.endsWith("/exec"))).toBe(true);
});
it("uses graceful stopping without a Docker kill fallback", async () => {
  const f = await dockerFixture();
  await f.runtime.stop();
  const request = f.daemon.requests.find((r) => r.path.endsWith("/stop"));
  expect(request?.query.get("t")).toBe("-1");
  expect(f.daemon.requests.some((r) => r.path.endsWith("/kill"))).toBe(false);
  expect(f.daemon.running).toBe(false);
});
it("rejects OOM or otherwise unclean stop outcomes", async () => {
  const f = await dockerFixture();
  f.daemon.oom = true;
  f.daemon.exitCode = 137;
  await expect(f.runtime.stop()).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
});
it("times out local waiting without force-killing Minecraft", async () => {
  const f = await dockerFixture();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  f.daemon.stopHold = deferred();
  const stopping = expect(f.runtime.stop()).rejects.toMatchObject({
    code: "BACKUP_RECOVERY_REQUIRED",
  });
  await f.daemon.stopEntered.promise;
  await vi.advanceTimersByTimeAsync(120001);
  await stopping;
  expect(f.daemon.requests.some((r) => r.path.endsWith("/kill"))).toBe(false);
  f.daemon.stopHold.resolve();
});
it("handles an idempotent start and propagates Docker start errors", async () => {
  const f = await dockerFixture();
  f.daemon.startStatus = 304;
  await f.runtime.start();
  f.daemon.startStatus = 500;
  await expect(f.runtime.start()).rejects.toMatchObject({ statusCode: 500 });
});
