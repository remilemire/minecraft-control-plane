// apps/backend/src/features/minecraft/clients/process.client.ts

import type { MinecraftServerStatus } from "@/features/minecraft/server/minecraft-server.types.js";
import { execFile } from "child_process";
import { promisify } from "util";

const COMPOSE_TIMEOUT_S = 30;

const execFileAsync = promisify(execFile);

export interface ProcessClientOptions {
  readonly composeFile: string;
  readonly serviceName: string;
}

export class ProcessClient {
  private readonly composeFile: string;
  private readonly serviceName: string;

  public constructor({ composeFile, serviceName }: ProcessClientOptions) {
    this.composeFile = composeFile;
    this.serviceName = serviceName;
  }

  public async start(): Promise<void> {
    await this.runCompose(["start", this.serviceName]);
  }

  public async stop(): Promise<void> {
    await this.runCompose(["stop", "--timeout", `${COMPOSE_TIMEOUT_S}`, this.serviceName]);
  }

  public async restart(): Promise<void> {
    await this.runCompose(["restart", "--timeout", `${COMPOSE_TIMEOUT_S}`, this.serviceName]);
  }

  public async getStatus(): Promise<MinecraftServerStatus> {
    const { stdout } = await this.runCompose([
      "ps",
      "--status",
      "running",
      "--quiet",
      this.serviceName,
    ]);

    return stdout.trim() === "" ? "STOPPED" : "RUNNING";
  }

  private runCompose(args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
    return execFileAsync("docker", ["compose", "--file", this.composeFile, ...args]);
  }
}
