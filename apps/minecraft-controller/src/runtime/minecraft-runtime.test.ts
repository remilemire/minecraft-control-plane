import Dockerode from "dockerode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DockerClient } from "./docker-client.js";
import { DockerMinecraftRuntime } from "./minecraft-runtime.js";
function fixture() {
  const docker = new Dockerode();
  const client = new DockerClient({ docker, projectName: "test", serviceName: "minecraft" });
  const inspect = vi.fn().mockResolvedValue({ State: { Running: true } });
  const container = {
    inspect,
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
  };
  vi.spyOn(client, "getManagedContainer").mockResolvedValue(
    container as unknown as Dockerode.Container,
  );
  return { runtime: new DockerMinecraftRuntime(client, docker), container };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("Minecraft runtime lifecycle", () => {
  it("starts an already-running container idempotently", async () => {
    const { runtime, container } = fixture();
    container.start.mockRejectedValueOnce(
      Object.assign(new Error("already started"), { statusCode: 304 }),
    );
    await expect(runtime.start()).resolves.toBeUndefined();
  });
  it("propagates unexpected Docker start failures", async () => {
    const { runtime, container } = fixture();
    container.start.mockRejectedValueOnce(
      Object.assign(new Error("Docker failed"), { statusCode: 500 }),
    );
    await expect(runtime.start()).rejects.toMatchObject({ statusCode: 500 });
  });
  it("uses an indefinite graceful stop and requires a clean exit", async () => {
    const { runtime, container } = fixture();
    container.inspect
      .mockResolvedValueOnce({ State: { Running: true } })
      .mockResolvedValueOnce({ State: { Running: false, OOMKilled: false, ExitCode: 0 } });
    await runtime.stop();
    expect(container.stop).toHaveBeenCalledWith({ t: -1 });
  });
  it.each([
    { Running: false, OOMKilled: true, ExitCode: 137 },
    { Running: false, OOMKilled: false, ExitCode: 1 },
    { Running: true, OOMKilled: false, ExitCode: 0 },
  ])("rejects an uncertain stop outcome %j", async (state) => {
    const { runtime, container } = fixture();
    container.inspect
      .mockResolvedValueOnce({ State: { Running: true } })
      .mockResolvedValueOnce({ State: state });
    await expect(runtime.stop()).rejects.toMatchObject({ code: "BACKUP_RECOVERY_REQUIRED" });
  });
  it("does not force-kill Minecraft when graceful stopping times out", async () => {
    vi.useFakeTimers();
    const { runtime, container } = fixture();
    container.stop.mockImplementation(() => new Promise(() => {}));
    const stopped = expect(runtime.stop()).rejects.toMatchObject({
      code: "BACKUP_RECOVERY_REQUIRED",
    });
    await vi.advanceTimersByTimeAsync(120001);
    await stopped;
    expect(container.stop).toHaveBeenCalledTimes(1);
    expect(container.stop).toHaveBeenCalledWith({ t: -1 });
  });
  it("checks RCON readiness before completing startup", async () => {
    const { runtime, container } = fixture();
    container.inspect.mockResolvedValue({
      Id: "test",
      Config: { Hostname: "host", Env: [] },
      State: { Running: true },
      HostConfig: { RestartPolicy: { Name: "no" } },
    });
    const execute = vi
      .spyOn(runtime, "execute")
      .mockResolvedValue("There are 0 of a max of 20 players online:");
    await runtime.waitReady();
    expect(execute).toHaveBeenCalledWith("list");
  });
});
