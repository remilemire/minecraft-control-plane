import { AppError } from "@/errors/app-error.js";
import type { RconApi } from "@/features/minecraft/minecraft.types.js";
import {
  controllerRconRequestSchema,
  controllerRconResponseSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { ControllerHttpClient, type ControllerHttpOptions } from "./controller-http.client.js";

// The controller serializes RCON with backups and lifecycle operations. The
// backend keeps the same service-facing interface without a second RCON lane.
export class RconClient implements RconApi {
  private readonly http: ControllerHttpClient;
  public constructor(options: ControllerHttpOptions) {
    this.http = new ControllerHttpClient(options, "RCON_CLIENT_ERROR");
  }
  public async execute(command: string): Promise<string> {
    const response = await this.http.request(
      "POST",
      "/rcon",
      AbortSignal.timeout(15_000),
      controllerRconRequestSchema.parse({ command }),
    );
    try {
      return controllerRconResponseSchema.parse(await response.json()).output;
    } catch (cause) {
      throw new AppError("RCON_CLIENT_ERROR", { cause });
    }
  }
}
