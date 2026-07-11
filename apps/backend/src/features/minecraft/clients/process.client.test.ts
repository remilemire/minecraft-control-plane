// apps/backend/src/features/minecraft/clients/process.client.test.ts

// Unit-testing the real client means mocking child_process.execFile
// (vi.mock("child_process")) — never run real docker commands in tests.

import { beforeEach, describe, expect, it, vi } from "vitest";

// The source promisifies the mocked execFile at import time. Our mock lacks
// the util.promisify.custom symbol, so promisify resolves with the single
// value we hand the callback — hence callback(null, { stdout, stderr }).
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("child_process", () => ({ execFile: execFileMock }));

const { ProcessClient } = await import("./process.client.js");

const COMPOSE_FILE = "/test/compose.yml";
const SERVICE = "mc";

function resolveStdout(stdout: string) {
  execFileMock.mockImplementation(
    (_file: string, _args: string[], callback: (err: unknown, result: unknown) => void) => {
      callback(null, { stdout, stderr: "" });
    },
  );
}

function client() {
  return new ProcessClient({ composeFile: COMPOSE_FILE, serviceName: SERVICE });
}

describe("ProcessClient", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    resolveStdout("");
  });

  it("invokes docker compose start/stop/restart with the configured file and service", async () => {
    const process = client();

    await process.start();
    expect(execFileMock).toHaveBeenLastCalledWith(
      "docker",
      ["compose", "--file", COMPOSE_FILE, "start", SERVICE],
      expect.any(Function),
    );

    await process.stop();
    expect(execFileMock).toHaveBeenLastCalledWith(
      "docker",
      ["compose", "--file", COMPOSE_FILE, "stop", "--timeout", "30", SERVICE],
      expect.any(Function),
    );

    await process.restart();
    expect(execFileMock).toHaveBeenLastCalledWith(
      "docker",
      ["compose", "--file", COMPOSE_FILE, "restart", "--timeout", "30", SERVICE],
      expect.any(Function),
    );
  });

  it("reports RUNNING when compose ps lists the service", async () => {
    resolveStdout("3f2a1b\n");
    const process = client();

    expect(await process.getStatus()).toBe("RUNNING");
    expect(execFileMock).toHaveBeenLastCalledWith(
      "docker",
      ["compose", "--file", COMPOSE_FILE, "ps", "--status", "running", "--quiet", SERVICE],
      expect.any(Function),
    );
  });

  it("reports STOPPED when compose ps output is empty", async () => {
    resolveStdout("   \n");
    const process = client();

    expect(await process.getStatus()).toBe("STOPPED");
  });
});
