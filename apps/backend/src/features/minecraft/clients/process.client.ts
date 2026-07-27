// apps/backend/src/features/minecraft/clients/process.client.ts

import { AppError } from "@/errors/app-error.js";
import type { ProcessApi } from "@/features/minecraft/minecraft.types.js";
import {
  minecraftServerStatusResponseSchema,
  type MinecraftServerStatus,
} from "@minecraft-server/shared/minecraft";

// Status is a quick container inspect; commands block while the controller
// waits out the container's 30s graceful-stop window, so their bound must
// out-wait it — while still guaranteeing a hung controller (or docker daemon
// behind it) can't wedge a panel request forever.
const STATUS_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 45_000;

export interface ProcessClientOptions {
  readonly baseUrl: string;
  readonly token: string;
}

export class ProcessClient implements ProcessApi {
  private readonly baseUrl: string;
  private readonly token: string;

  public constructor({ baseUrl, token }: ProcessClientOptions) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  public async start(): Promise<void> {
    await this.command("/start");
  }

  public async stop(): Promise<void> {
    await this.command("/stop");
  }

  public async restart(): Promise<void> {
    await this.command("/restart");
  }

  public async getStatus(): Promise<MinecraftServerStatus> {
    const response = await this.request("GET", "/status", STATUS_TIMEOUT_MS);

    if (response.status !== 200) {
      throw new AppError("PROCESS_CLIENT_ERROR", {
        message: `Controller returned status ${response.status}.`,
      });
    }

    const data = await response.json();
    const result = minecraftServerStatusResponseSchema.safeParse(data);

    if (!result.success) {
      throw new AppError("PROCESS_CLIENT_ERROR", {
        message: "Controller returned an unexpected response.",
        cause: result.error,
      });
    }

    return result.data.status;
  }

  private async command(path: string): Promise<void> {
    const response = await this.request("POST", path, COMMAND_TIMEOUT_MS);

    if (response.status !== 204) {
      throw new AppError("PROCESS_CLIENT_ERROR", {
        message: `Controller returned status ${response.status}.`,
      });
    }
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    timeoutMs: number,
  ): Promise<Response> {
    // Unlike Mojang, the controller being unreachable is an expected
    // operational state (it restarts independently), so network-level
    // failures and timeouts map to SERVICE_UNAVAILABLE, not INTERNAL.
    try {
      return await fetch(new URL(path, this.baseUrl), {
        method,
        headers: { authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AppError("PROCESS_CLIENT_ERROR", {
        message: "Failed to reach the Minecraft server controller.",
        cause: error,
      });
    }
  }
}
