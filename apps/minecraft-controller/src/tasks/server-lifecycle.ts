import { rm } from "node:fs/promises";
import { join } from "node:path";
import { ControllerError, publicFailure } from "@/errors.js";
import type { MinecraftRuntime } from "@/runtime/contracts.js";
import type { ControllerStore } from "@/state/store.js";
import { syncDirectory } from "@/state/atomic-files.js";
import type { TaskContext } from "@/maintenance/coordinator.js";
import type { OperationJournal } from "./operations.js";
export class ServerTaskLifecycle {
  public constructor(
    private readonly runtime: MinecraftRuntime,
    private readonly store: ControllerStore,
    private readonly workRoot: string,
    private readonly observer?: (operation: OperationJournal, event: string) => Promise<void>,
  ) {}
  public async phase(context: TaskContext<OperationJournal>, name: string): Promise<void> {
    context.operation.phase = name;
    await context.checkpoint(name);
  }
  public async capture(context: TaskContext<OperationJournal>): Promise<void> {
    const state = await this.runtime.inspect();
    context.operation.containerId = state.containerId;
    context.operation.wasRunning = state.running;
    await this.store.persist();
  }
  public async cleanup(context: TaskContext<OperationJournal>): Promise<void> {
    await rm(join(this.workRoot, context.operation.id), { recursive: true, force: true });
    await syncDirectory(this.workRoot);
  }
  public async identity(op: OperationJournal): Promise<void> {
    const current = await this.runtime.inspect();
    if (op.containerId !== current.containerId)
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "The Minecraft container changed during maintenance. Keep it stopped and inspect recovery before proceeding.",
      );
  }
  public async assertStopped(op: OperationJournal): Promise<void> {
    await this.identity(op);
    if ((await this.runtime.inspect()).running)
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "Minecraft started outside the panel during maintenance. Stop it before recovering.",
      );
  }
  public async suspend(context: TaskContext<OperationJournal>): Promise<void> {
    const op = context.operation;
    const current = await this.runtime.inspect();
    await this.identity(op);
    op.restartPolicy ??= current.restartPolicy;
    op.stoppedByOperation = true;
    await this.store.persist();
    await this.runtime.setRestartPolicy({ Name: "no" });
    await this.phase(context, "Stopping Minecraft gracefully");
    try {
      await this.runtime.stop();
    } catch (error) {
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        `${publicFailure(error)} The stop outcome must be checked before recovery continues.`,
        { cause: error },
      );
    }
    await this.assertStopped(op);
  }
  public async resume(context: TaskContext<OperationJournal>): Promise<void> {
    const op = context.operation;
    await this.identity(op);
    if (op.wasRunning && op.stoppedByOperation) {
      await this.phase(context, "Starting Minecraft and checking readiness");
      await context.boot(op.containerId!, async () => {
        if (!(await this.runtime.inspect()).running) await this.runtime.start();
        await this.observer?.(op, "verification-boot");
        await this.runtime.waitReady();
      });
    }
    if (op.restartPolicy) {
      await this.runtime.setRestartPolicy(op.restartPolicy);
      op.restartPolicy = null;
    }
    op.stoppedByOperation = false;
    await this.store.persist();
  }
  public async enableSaving(op: OperationJournal): Promise<void> {
    if (!op.savingDisabled) return;
    await this.identity(op);
    if ((await this.runtime.inspect()).running) {
      const output = await this.runtime.execute("save-on");
      if (!/already turned on|enabled|turned on/i.test(output))
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          "Minecraft saving could not be re-enabled. Check RCON and run make backup-recover.",
        );
    }
    op.savingDisabled = false;
    await this.store.persist();
  }
}
