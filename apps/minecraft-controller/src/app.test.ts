// apps/minecraft-controller/src/app.test.ts

import type { MinecraftServerStatus } from "@minecraft-server/shared/minecraft";
import supertest from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { ContainerNotFoundError, type MinecraftDockerApi } from "./docker.js";
import { createRoutes } from "./routes.js";

const TOKEN = "test-token";
const AUTHORIZATION = `Bearer ${TOKEN}`;

class FakeMinecraftDocker implements MinecraftDockerApi {
  public readonly calls: ("start" | "stop" | "restart")[] = [];
  public status: MinecraftServerStatus = "RUNNING";

  public async start(): Promise<void> {
    this.calls.push("start");
  }

  public async stop(): Promise<void> {
    this.calls.push("stop");
  }

  public async restart(): Promise<void> {
    this.calls.push("restart");
  }

  public async getStatus(): Promise<MinecraftServerStatus> {
    return this.status;
  }
}

function createTestApp(docker: MinecraftDockerApi = new FakeMinecraftDocker()) {
  return createApp({ router: createRoutes({ docker }), token: TOKEN });
}

describe("createApp", () => {
  it.each(["/start", "/stop", "/restart"] as const)(
    "POST %s returns 204 and drives docker with a valid token",
    async (path) => {
      const docker = new FakeMinecraftDocker();

      const response = await supertest(createTestApp(docker))
        .post(path)
        .set("authorization", AUTHORIZATION);

      expect(response.status).toBe(204);
      expect(docker.calls).toEqual([path.slice(1)]);
    },
  );

  it("GET /status returns the docker status", async () => {
    const docker = new FakeMinecraftDocker();
    docker.status = "STOPPED";

    const response = await supertest(createTestApp(docker))
      .get("/status")
      .set("authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "STOPPED" });
  });

  it("rejects a missing token with 401", async () => {
    const docker = new FakeMinecraftDocker();

    const response = await supertest(createTestApp(docker)).post("/start");

    expect(response.status).toBe(401);
    expect(docker.calls).toEqual([]);
  });

  it("rejects a wrong token with 401", async () => {
    const response = await supertest(createTestApp())
      .get("/status")
      .set("authorization", "Bearer wrong-token");

    expect(response.status).toBe(401);
  });

  it("maps ContainerNotFoundError to a 500 with its message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const docker = new FakeMinecraftDocker();
    docker.getStatus = async () => {
      throw new ContainerNotFoundError("minecraft-server", "minecraft");
    };

    const response = await supertest(createTestApp(docker))
      .get("/status")
      .set("authorization", AUTHORIZATION);

    expect(response.status).toBe(500);
    expect(response.body.message).toMatch(/No container found/);
    vi.restoreAllMocks();
  });

  it("maps unexpected errors to a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const docker = new FakeMinecraftDocker();
    docker.start = async () => {
      throw new Error("socket unavailable");
    };

    const response = await supertest(createTestApp(docker))
      .post("/start")
      .set("authorization", AUTHORIZATION);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: "Internal server error." });
    vi.restoreAllMocks();
  });
});
