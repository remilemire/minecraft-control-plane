// apps/minecraft-controller/src/docker.test.ts

import type Dockerode from "dockerode";
import { describe, expect, it, vi } from "vitest";
import { ContainerNotFoundError, DockerClient } from "./docker.js";

const PROJECT = "minecraft-control-plane";
const SERVICE = "minecraft";
const CONTAINER_ID = "abc123";

interface FakeDockerodeInit {
  readonly containers?: Partial<Dockerode.ContainerInfo>[];
  readonly start?: () => Promise<unknown>;
  readonly stop?: () => Promise<unknown>;
  readonly restart?: () => Promise<unknown>;
}

function fakeDockerode({ containers, start, stop, restart }: FakeDockerodeInit = {}) {
  const container = {
    start: vi.fn(start ?? (async () => ({}))),
    stop: vi.fn(stop ?? (async () => ({}))),
    restart: vi.fn(restart ?? (async () => ({}))),
  };
  const docker = {
    listContainers: vi.fn(async () => containers ?? [{ Id: CONTAINER_ID, State: "running" }]),
    getContainer: vi.fn(() => container),
  };
  return { docker, container };
}

function createClient(docker: ReturnType<typeof fakeDockerode>["docker"]) {
  return new DockerClient({
    docker: docker as unknown as Dockerode,
    projectName: PROJECT,
    serviceName: SERVICE,
  });
}

function dockerStatusError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`(HTTP code ${statusCode})`), { statusCode });
}

describe("DockerClient", () => {
  it("looks the container up by both compose project and service labels, including stopped ones", async () => {
    const { docker } = fakeDockerode();

    await createClient(docker).start();

    expect(docker.listContainers).toHaveBeenCalledWith({
      all: true,
      filters: {
        label: [`com.docker.compose.project=${PROJECT}`, `com.docker.compose.service=${SERVICE}`],
      },
    });
    expect(docker.getContainer).toHaveBeenCalledWith(CONTAINER_ID);
  });

  it("starts the container", async () => {
    const { docker, container } = fakeDockerode();

    await createClient(docker).start();

    expect(container.start).toHaveBeenCalledOnce();
  });

  it("stops and restarts with the graceful timeout", async () => {
    const { docker, container } = fakeDockerode();
    const client = createClient(docker);

    await client.stop();
    await client.restart();

    expect(container.stop).toHaveBeenCalledWith({ t: 30 });
    expect(container.restart).toHaveBeenCalledWith({ t: 30 });
  });

  it("treats starting an already-started container as success (304)", async () => {
    const { docker } = fakeDockerode({ start: async () => Promise.reject(dockerStatusError(304)) });

    await expect(createClient(docker).start()).resolves.toBeUndefined();
  });

  it("treats stopping an already-stopped container as success (304)", async () => {
    const { docker } = fakeDockerode({ stop: async () => Promise.reject(dockerStatusError(304)) });

    await expect(createClient(docker).stop()).resolves.toBeUndefined();
  });

  it("propagates non-304 docker errors", async () => {
    const { docker } = fakeDockerode({ start: async () => Promise.reject(dockerStatusError(500)) });

    await expect(createClient(docker).start()).rejects.toMatchObject({ statusCode: 500 });
  });

  it("throws ContainerNotFoundError from every method when no container matches", async () => {
    const { docker } = fakeDockerode({ containers: [] });
    const client = createClient(docker);

    await expect(client.start()).rejects.toBeInstanceOf(ContainerNotFoundError);
    await expect(client.stop()).rejects.toBeInstanceOf(ContainerNotFoundError);
    await expect(client.restart()).rejects.toBeInstanceOf(ContainerNotFoundError);
    await expect(client.getStatus()).rejects.toBeInstanceOf(ContainerNotFoundError);
  });

  it("reports RUNNING for a running container", async () => {
    const { docker } = fakeDockerode({ containers: [{ Id: CONTAINER_ID, State: "running" }] });

    expect(await createClient(docker).getStatus()).toBe("RUNNING");
  });

  it("reports STOPPED for any non-running state", async () => {
    const { docker } = fakeDockerode({ containers: [{ Id: CONTAINER_ID, State: "exited" }] });

    expect(await createClient(docker).getStatus()).toBe("STOPPED");
  });
});
