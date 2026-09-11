// apps/backend/src/features/minecraft/clients/process.client.ts

import { AppError } from "@/errors/app-error.js";
import type { ProcessApi } from "@/features/minecraft/minecraft.types.js";
import {
  minecraftConsoleLogEventSchema,
  minecraftServerStatusResponseSchema,
  type MinecraftConsoleLogEvent,
  type MinecraftServerStatus,
  type MinecraftServerStatusResponse,
} from "@minecraft-control-plane/shared/minecraft";
import { ControllerHttpClient } from "./controller-http.client.js";

// Restart can include a two-minute graceful stop and ten-minute readiness check.
// Leave room for both while still bounding an unavailable controller.
const STATUS_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 13 * 60_000;

export interface ProcessClientOptions {
  readonly baseUrl: string;
  readonly token: string;
}

export class ProcessClient implements ProcessApi {
  private readonly http: ControllerHttpClient;

  public constructor({ baseUrl, token }: ProcessClientOptions) {
    this.http = new ControllerHttpClient({ baseUrl, token }, "PROCESS_CLIENT_ERROR");
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
    return (await this.getStatusDetails()).status;
  }

  public async getStatusDetails(): Promise<MinecraftServerStatusResponse> {
    const response = await this.request("GET", "/status", AbortSignal.timeout(STATUS_TIMEOUT_MS));

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

    return result.data;
  }

  public async openLogStream(
    signal: AbortSignal,
  ): Promise<AsyncIterable<MinecraftConsoleLogEvent>> {
    const response = await this.request("GET", "/logs", signal);

    if (response.status !== 200 || response.body === null) {
      throw new AppError("PROCESS_CLIENT_ERROR", {
        message: `Controller returned status ${response.status}.`,
      });
    }

    return parseLogEvents(response.body);
  }

  private async command(path: string): Promise<void> {
    const response = await this.request("POST", path, AbortSignal.timeout(COMMAND_TIMEOUT_MS));

    if (response.status !== 204) {
      throw new AppError("PROCESS_CLIENT_ERROR", {
        message: `Controller returned status ${response.status}.`,
      });
    }
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    signal: AbortSignal,
  ): Promise<Response> {
    return this.http.request(method, path, signal);
  }
}

async function* parseLogEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<MinecraftConsoleLogEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        completed = true;
        pending += decoder.decode();
        break;
      }

      pending += decoder.decode(result.value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";

      for (const line of lines) {
        if (line !== "") {
          yield parseLogEvent(line);
        }
      }
    }

    if (pending !== "") {
      yield parseLogEvent(pending);
    }
  } catch (error) {
    throw error instanceof AppError
      ? error
      : new AppError("PROCESS_CLIENT_ERROR", {
          message: "Controller returned an invalid log stream.",
          cause: error,
        });
  } finally {
    if (!completed) {
      try {
        await reader.cancel();
      } catch {
        // The request signal may already have closed the upstream body.
      }
    }
    reader.releaseLock();
  }
}

function parseLogEvent(line: string): MinecraftConsoleLogEvent {
  try {
    return minecraftConsoleLogEventSchema.parse(JSON.parse(line));
  } catch (error) {
    throw new AppError("PROCESS_CLIENT_ERROR", {
      message: "Controller returned an invalid log event.",
      cause: error,
    });
  }
}
