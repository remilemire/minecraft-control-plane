import type { TaskHandlers, TaskContext } from "@/maintenance/coordinator.js";
import type { MinecraftRuntime } from "@/runtime/contracts.js";
import type { PowerOperation } from "./operations.js";
import type { ServerTaskLifecycle } from "./server-lifecycle.js";
export class PowerTask implements TaskHandlers<PowerOperation> {
  public readonly version = 1;
  public readonly legacyVersions = [0];
  public constructor(
    private readonly runtime: MinecraftRuntime,
    private readonly lifecycle: ServerTaskLifecycle,
  ) {}
  public prepare(context: TaskContext<PowerOperation>): Promise<void> {
    return this.lifecycle.capture(context);
  }
  public async apply(context: TaskContext<PowerOperation>): Promise<void> {
    switch (context.operation.kind) {
      case "start":
        await this.lifecycle.phase(context, "Starting Minecraft and checking readiness");
        await context.boot(context.operation.containerId!, async () => {
          await this.runtime.start();
          await this.runtime.waitReady();
        });
        return;
      case "stop":
        await this.runtime.stop();
        return;
      case "restart":
        await this.lifecycle.suspend(context);
        context.operation.wasRunning = true;
        await this.lifecycle.resume(context);
        return;
    }
  }
  public async recover(context: TaskContext<PowerOperation>): Promise<void> {
    if (context.operation.containerId) await this.lifecycle.resume(context);
  }
  public async hold(): Promise<void> {}
  public cleanup(context: TaskContext<PowerOperation>): Promise<void> {
    return this.lifecycle.cleanup(context);
  }
}
