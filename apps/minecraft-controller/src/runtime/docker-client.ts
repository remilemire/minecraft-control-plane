// apps/minecraft-controller/src/docker.ts

import type {
  MinecraftConsoleLogEvent,
  MinecraftServerStatus,
} from "@minecraft-control-plane/shared/minecraft";
import type Dockerode from "dockerode";
import { ControllerConfigurationError } from "@/errors.js";
import type { Readable } from "node:stream";
import { createDockerLogEventStream } from "./docker-log-stream.js";

export type { MinecraftReader } from "./contracts.js";
import type { MinecraftReader } from "./contracts.js";

// A missing container is a misconfiguration (or a torn-down stack), never
// "STOPPED" — STOPPED strictly means the container exists and is not running.
export class ContainerNotFoundError extends ControllerConfigurationError {
  public constructor(projectName: string, serviceName: string) {
    super(`No container found for service "${serviceName}" in project "${projectName}".`);
    this.name = "ContainerNotFoundError";
  }
}

export class MultipleContainersFoundError extends Error {
  public constructor(projectName: string, serviceName: string, count: number) {
    super(
      `Found ${count} containers for service "${serviceName}" in project "${projectName}"; expected exactly one.`,
    );
    this.name = "MultipleContainersFoundError";
  }
}

export interface DockerClientOptions {
  readonly docker: Dockerode;
  readonly projectName: string;
  readonly serviceName: string;
}

export class DockerClient implements MinecraftReader {
  private readonly docker: Dockerode;
  private readonly projectName: string;
  private readonly serviceName: string;
  // This registry exists only so controller shutdown can close every active
  // Docker connection. Per-request ownership belongs to the event stream.
  private readonly activeLogSources = new Set<Readable>();

  public constructor({ docker, projectName, serviceName }: DockerClientOptions) {
    this.docker = docker;
    this.projectName = projectName;
    this.serviceName = serviceName;
  }

  public async getManagedContainer(): Promise<Dockerode.Container> {
    const container = await this.findContainer();
    return this.docker.getContainer(container.Id);
  }

  public async getStatus(): Promise<MinecraftServerStatus> {
    const container = await this.findContainer();
    return container.State === "running" ? "RUNNING" : "STOPPED";
  }

  public async openLogStream(
    signal: AbortSignal,
  ): Promise<AsyncIterable<MinecraftConsoleLogEvent>> {
    signal.throwIfAborted();
    const containerInfo = await this.findContainer();
    const container = this.docker.getContainer(containerInfo.Id);
    const source = (await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 100,
    })) as Readable;
    const unregisterSource = this.registerLogSource(source);

    try {
      signal.throwIfAborted();

      // Docker frames stdout/stderr with binary headers when the container has
      // no TTY. docker-modem also falls back to stdout passthrough for TTY logs.
      return createDockerLogEventStream(source, signal, (stdout, stderr) => {
        this.docker.modem.demuxStream(source, stdout, stderr);
      });
    } catch (error) {
      // The adapter did not return, so ownership of the source was not transferred.
      unregisterSource();
      if (!source.destroyed) {
        source.destroy();
      }
      throw error;
    }
  }

  public closeLogStreams(): void {
    for (const source of [...this.activeLogSources]) {
      if (!source.destroyed) {
        source.destroy();
      }
    }
  }

  private async findContainer(): Promise<Dockerode.ContainerInfo> {
    // `all: true` keeps a stopped container findable — without it, a stopped
    // server could never be started. Both labels scope the lookup to this
    // compose project's service, not a same-named service from another project
    // sharing the daemon.
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [
          `com.docker.compose.project=${this.projectName}`,
          `com.docker.compose.service=${this.serviceName}`,
        ],
      },
    });

    const container = containers[0];
    if (container === undefined) {
      throw new ContainerNotFoundError(this.projectName, this.serviceName);
    }
    if (containers.length > 1) {
      throw new MultipleContainersFoundError(this.projectName, this.serviceName, containers.length);
    }

    return container;
  }

  private registerLogSource(source: Readable): () => void {
    const unregister = () => {
      this.activeLogSources.delete(source);
      source.off("close", unregister);
    };

    this.activeLogSources.add(source);
    source.once("close", unregister);
    return unregister;
  }
}
