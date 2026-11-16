import { ControllerError } from "@/errors.js";
import type { MinecraftRuntime, MinecraftReader } from "@/runtime/contracts.js";
import type { MaintenanceService } from "@/maintenance/service.js";
import type { MinecraftServerStatusResponse } from "@minecraft-control-plane/shared/minecraft";
export class ServerService {
  public constructor(
    private readonly runtime: MinecraftRuntime,
    private readonly reader: MinecraftReader,
    private readonly maintenance: MaintenanceService,
  ) {}
  public async power(kind: "start" | "stop" | "restart"): Promise<void> {
    const id = await this.maintenance.submit({ kind });
    await this.maintenance.wait();
    const op = this.maintenance.operation(id);
    if (op.status !== "succeeded")
      throw new ControllerError(
        op.status === "recoveryRequired" ? "BACKUP_RECOVERY_REQUIRED" : "BACKUP_CONTROLLER_ERROR",
        op.error ?? "The power operation failed.",
      );
  }
  public execute(command: string): Promise<string> {
    return this.maintenance.exclusive(() => this.runtime.execute(command));
  }
  public async getStatus(): Promise<MinecraftServerStatusResponse> {
    return {
      status: await this.reader.getStatus(),
      maintenance: this.maintenance.activeOperation(),
    };
  }
  public openLogStream(signal: AbortSignal) {
    return this.reader.openLogStream(signal);
  }
  public closeLogStreams(): void {
    this.reader.closeLogStreams();
  }
}
