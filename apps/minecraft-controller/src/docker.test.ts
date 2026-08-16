// apps/minecraft-controller/src/docker.test.ts

import type Dockerode from "dockerode";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ContainerNotFoundError, DockerClient, MultipleContainersFoundError } from "./docker.js";

const PROJECT = "minecraft-control-plane";
const SERVICE = "minecraft";
const CONTAINER_ID = "abc123";

interface FakeDockerodeInit {
  readonly containers?: Partial<Dockerode.ContainerInfo>[];
  readonly start?: () => Promise<unknown>;
  readonly stop?: () => Promise<unknown>;
  readonly restart?: () => Promise<unknown>;
  readonly logs?: () => Promise<Readable>;
  readonly demuxStream?: (
    source: Readable,
    stdout: NodeJS.WritableStream,
    stderr: NodeJS.WritableStream,
  ) => void;
}

function fakeDockerode({
  containers,
  start,
  stop,
  restart,
  logs,
  demuxStream,
}: FakeDockerodeInit = {}) {
  const container = {
    start: vi.fn(start ?? (async () => ({}))),
    stop: vi.fn(stop ?? (async () => ({}))),
    restart: vi.fn(restart ?? (async () => ({}))),
    logs: vi.fn(logs ?? (async () => Readable.from([]))),
  };
  const docker = {
    listContainers: vi.fn(async () => containers ?? [{ Id: CONTAINER_ID, State: "running" }]),
    getContainer: vi.fn(() => container),
    modem: {
      demuxStream: vi.fn(
        demuxStream ??
          ((source: Readable, stdout: NodeJS.WritableStream) => {
            source.pipe(stdout);
          }),
      ),
    },
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
    await expect(client.openLogStream(new AbortController().signal)).rejects.toBeInstanceOf(
      ContainerNotFoundError,
    );
  });

  it("rejects an ambiguous container selection instead of choosing one", async () => {
    const { docker } = fakeDockerode({
      containers: [
        { Id: CONTAINER_ID, State: "running" },
        { Id: "duplicate", State: "exited" },
      ],
    });

    await expect(createClient(docker).start()).rejects.toBeInstanceOf(MultipleContainersFoundError);
  });

  it("reports RUNNING for a running container", async () => {
    const { docker } = fakeDockerode({ containers: [{ Id: CONTAINER_ID, State: "running" }] });

    expect(await createClient(docker).getStatus()).toBe("RUNNING");
  });

  it("reports STOPPED for any non-running state", async () => {
    const { docker } = fakeDockerode({ containers: [{ Id: CONTAINER_ID, State: "exited" }] });

    expect(await createClient(docker).getStatus()).toBe("STOPPED");
  });

  it("follows and demultiplexes the last 100 log lines into structured events", async () => {
    const source = Readable.from([]);
    const { docker, container } = fakeDockerode({
      logs: async () => source,
      demuxStream(raw, stdout, stderr) {
        stdout.write(Buffer.from("first\npart"));
        stdout.write(Buffer.from("ial\n"));
        stderr.write(Buffer.from("warning\n"));
        raw.resume();
      },
    });
    const events = await createClient(docker).openLogStream(new AbortController().signal);
    const received = [];

    for await (const event of events) {
      received.push(event);
    }

    expect(container.logs).toHaveBeenCalledWith({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 100,
    });
    expect(received).toEqual([
      { stream: "stdout", line: "first" },
      { stream: "stdout", line: "partial" },
      { stream: "stderr", line: "warning" },
    ]);
  });

  it("destroys and unregisters the source when log stream setup fails", async () => {
    const source = new Readable({ read() {} });
    const destroy = vi.spyOn(source, "destroy");
    const failure = new Error("demux setup failed");
    const { docker } = fakeDockerode({
      logs: async () => source,
      demuxStream() {
        throw failure;
      },
    });
    const client = createClient(docker);

    await expect(client.openLogStream(new AbortController().signal)).rejects.toThrow(failure);
    client.closeLogStreams();

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("leaves normal stream cleanup to the adapter after ownership transfers", async () => {
    const source = new Readable({ read() {} });
    const destroy = vi.spyOn(source, "destroy");
    const { docker } = fakeDockerode({
      logs: async () => source,
      demuxStream(_raw, stdout) {
        stdout.write(Buffer.from("first\n"));
      },
    });
    const client = createClient(docker);
    const events = await client.openLogStream(new AbortController().signal);

    for await (const event of events) {
      expect(event).toEqual({ stream: "stdout", line: "first" });
      break;
    }

    client.closeLogStreams();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("uses the active source registry only to close streams during controller shutdown", async () => {
    const source = new Readable({ read() {} });
    const destroy = vi.spyOn(source, "destroy");
    const { docker } = fakeDockerode({ logs: async () => source, demuxStream() {} });
    const client = createClient(docker);
    const events = await client.openLogStream(new AbortController().signal);

    client.closeLogStreams();
    await expect(events[Symbol.asyncIterator]().next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
    client.closeLogStreams();

    expect(destroy).toHaveBeenCalledOnce();
  });
});
