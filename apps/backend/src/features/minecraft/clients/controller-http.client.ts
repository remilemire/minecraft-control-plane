import { AppError } from "@/errors/app-error.js";
import {
  minecraftBackupErrorMeta,
  type MinecraftBackupErrorCode,
} from "@minecraft-control-plane/shared/minecraft";
import { z } from "zod";

export interface ControllerHttpOptions {
  readonly baseUrl: string;
  readonly token: string;
}
const controllerErrorSchema = z.object({ code: z.string() });

export class ControllerHttpClient {
  public constructor(
    private readonly options: ControllerHttpOptions,
    private readonly failureCode:
      | "PROCESS_CLIENT_ERROR"
      | "RCON_CLIENT_ERROR"
      | "BACKUP_CONTROLLER_ERROR",
  ) {}

  public async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    signal: AbortSignal,
    body?: unknown,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.options.baseUrl), {
        method,
        headers: {
          authorization: `Bearer ${this.options.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new AppError(this.failureCode, {
        message: "Failed to reach the Minecraft controller.",
        cause,
      });
    }
    if (!response.ok) {
      const error = controllerErrorSchema.safeParse(await response.json().catch(() => null));
      if (error.success && Object.hasOwn(minecraftBackupErrorMeta, error.data.code))
        throw new AppError(error.data.code as MinecraftBackupErrorCode);
      throw new AppError(this.failureCode, {
        message: `Controller returned status ${String(response.status)}.`,
      });
    }
    return response;
  }
}
