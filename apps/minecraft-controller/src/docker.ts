// apps/minecraft-controller/src/docker.ts

import type { MinecraftServerStatus } from "@minecraft-server/shared/minecraft";
import type Dockerode from "dockerode";

const STOP_TIMEOUT_S = 30;

export interface MinecraftDockerApi {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): Promise<MinecraftServerStatus>;
}

// A missing container is a misconfiguration (or a torn-down stack), never
// "STOPPED" — STOPPED strictly means the container exists and is not running.
export class ContainerNotFoundError extends Error {
  public constructor(projectName: string, serviceName: string) {
    super(`No container found for service "${serviceName}" in project "${projectName}".`);
    this.name = "ContainerNotFoundError";
  }
}

export interface DockerClientOptions {
  readonly docker: Dockerode;
  readonly projectName: string;
  readonly serviceName: string;
}

export class DockerClient implements MinecraftDockerApi {
  private readonly docker: Dockerode;
  private readonly projectName: string;
  private readonly serviceName: string;

  public constructor({ docker, projectName, serviceName }: DockerClientOptions) {
    this.docker = docker;
    this.projectName = projectName;
    this.serviceName = serviceName;
  }

  public async start(): Promise<void> {
    const container = await this.findContainer();
    // 304 = already started; `docker compose start` treats that as success.
    await swallowStatus(304, () => this.docker.getContainer(container.Id).start());
  }

  public async stop(): Promise<void> {
    const container = await this.findContainer();
    // 304 = already stopped; parity with `docker compose stop` again.
    await swallowStatus(304, () =>
      this.docker.getContainer(container.Id).stop({ t: STOP_TIMEOUT_S }),
    );
  }

  public async restart(): Promise<void> {
    const container = await this.findContainer();
    await this.docker.getContainer(container.Id).restart({ t: STOP_TIMEOUT_S });
  }

  public async getStatus(): Promise<MinecraftServerStatus> {
    const container = await this.findContainer();
    return container.State === "running" ? "RUNNING" : "STOPPED";
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
    return container;
  }
}

async function swallowStatus(statusCode: number, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (!isDockerStatusError(error, statusCode)) {
      throw error;
    }
  }
}

function isDockerStatusError(error: unknown, statusCode: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === statusCode
  );
}
