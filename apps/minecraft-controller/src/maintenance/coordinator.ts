import { MaintenanceError, dockerUnavailable } from "./errors.js";
import type { StartupAuthorization } from "./startup-gate.js";

export interface JournalEntry {
  id: string;
  kind: string;
  status: "running" | "succeeded" | "failed" | "recoveryRequired";
  phase: string;
  finishedAt: string | null;
  error: string | null;
  taskVersion: number;
  checkpoint: string | null;
  recoverOnReconnect: boolean;
  cleanupComplete: boolean;
}
export interface TaskContext<J extends JournalEntry> {
  operation: J;
  interrupted: boolean;
  checkpoint(name: string): Promise<void>;
}
export interface MaintenanceTask<J extends JournalEntry> {
  version: number;
  legacyVersions?: readonly number[];
  matchesRequest?(previous: J, incoming: J): boolean;
  prepare?(context: TaskContext<J>): Promise<void>;
  safetyBackup?: (context: TaskContext<J>) => Promise<void>;
  destructive?: boolean;
  safetyBackupVerified?: (operation: J) => boolean;
  apply(context: TaskContext<J>): Promise<void>;
  verify?(context: TaskContext<J>): Promise<void>;
  recover(context: TaskContext<J>): Promise<void>;
  hold(context: TaskContext<J>): Promise<void>;
  cleanup?(context: TaskContext<J>): Promise<void>;
}
export interface CoordinatorOptions<J extends JournalEntry> {
  operations(): J[];
  persist(): Promise<void>;
  tasks: ReadonlyMap<string, MaintenanceTask<J>>;
  gate?: StartupAuthorization | undefined;
  available(): Promise<void>;
  describe(error: unknown): string;
  now(): Date;
  observer?: ((operation: J, event: string) => Promise<void>) | undefined;
}

// One writer and one reservation cover every task. Persistence remains in the
// aggregate store so schedule consumption and admission commit atomically.
export class MaintenanceCoordinator<J extends JournalEntry> {
  public initialized = false;
  public closing = false;
  private readers = 0;
  private executing: J | null = null;
  private work: Promise<void> | undefined;
  public constructor(private readonly options: CoordinatorOptions<J>) {}
  public active(): J | null {
    return (
      this.executing ??
      this.options
        .operations()
        .find(
          (o) => o.status === "running" || o.status === "recoveryRequired" || !o.cleanupComplete,
        ) ??
      null
    );
  }
  public operation(id: string): J | undefined {
    return this.options.operations().find((o) => o.id === id);
  }
  public isExecuting(id: string): boolean {
    return this.executing?.id === id;
  }
  public status(operation: J): JournalEntry["status"] {
    if (this.isExecuting(operation.id)) return "running";
    if (
      (operation.status === "succeeded" || operation.status === "failed") &&
      !operation.cleanupComplete
    )
      return "recoveryRequired";
    return operation.status;
  }
  public assertAvailable(): void {
    if (!this.initialized || this.closing)
      throw new MaintenanceError(
        "BACKUP_CONTROLLER_ERROR",
        "The controller is starting or shutting down.",
      );
    const active = this.active();
    if (active && this.status(active) === "recoveryRequired")
      throw new MaintenanceError(
        "BACKUP_RECOVERY_REQUIRED",
        "Recovery requires attention. Inspect the controller logs, then run make backup-recover.",
      );
    if (this.active() || this.readers)
      throw new MaintenanceError(
        "MINECRAFT_MAINTENANCE",
        "A Minecraft operation is already in progress. Try again after it finishes.",
      );
  }
  public async exclusive<T>(action: () => Promise<T>): Promise<T> {
    this.assertAvailable();
    this.readers++;
    try {
      return await action();
    } finally {
      this.readers--;
    }
  }
  public async checkpoint(operation: J, name: string): Promise<void> {
    operation.checkpoint = name;
    try {
      await this.options.persist();
    } catch (error) {
      throw new MaintenanceError(
        "BACKUP_RECOVERY_REQUIRED",
        "The maintenance checkpoint could not be persisted. Startup remains blocked.",
        { cause: error },
      );
    }
    await this.options.observer?.(operation, name);
  }
  public async boot<T>(operation: J, containerId: string, action: () => Promise<T>): Promise<T> {
    await this.checkpoint(operation, "boot-safe");
    return this.options.gate ? this.options.gate.boot(containerId, action) : action();
  }
  public async recoverInterrupted(): Promise<void> {
    for (const operation of this.options.operations()) {
      this.task(operation);
    }
    const interrupted = this.options.operations().find((o) => o.status === "running");
    if (interrupted) await this.recover(interrupted);
    for (const operation of this.options.operations()) {
      if (
        (operation.status === "succeeded" || operation.status === "failed") &&
        !operation.cleanupComplete
      )
        await this.cleanup(operation);
    }
  }
  public async ready(): Promise<void> {
    this.initialized = true;
    if (!this.active()) await this.options.gate?.open();
  }
  public async submit(operation: J, reserve: () => void): Promise<string> {
    const previous = this.operation(operation.id);
    if (previous) {
      if (
        previous.kind !== operation.kind ||
        this.task(operation).matchesRequest?.(previous, operation) === false
      )
        throw new MaintenanceError(
          "BACKUP_REQUEST_CONFLICT",
          "This request ID was already used for another operation.",
        );
      return previous.id;
    }
    this.assertAvailable();
    this.task(operation);
    this.executing = operation; // Synchronous reservation precedes the first await.
    this.options.operations().push(operation);
    reserve();
    try {
      await this.options.gate?.block();
      await this.options.persist();
    } catch (error) {
      operation.status = "recoveryRequired";
      this.executing = null;
      throw error;
    }
    this.work = this.run(operation).finally(() => this.release());
    return operation.id;
  }
  public async wait(): Promise<void> {
    await this.work;
  }
  public async close(): Promise<void> {
    this.closing = true;
    await this.options.gate?.block();
    await this.work;
  }
  public async retry(): Promise<void> {
    const operation = this.active();
    if (
      !this.initialized ||
      this.closing ||
      this.executing ||
      this.readers ||
      !operation?.recoverOnReconnect
    )
      return;
    try {
      await this.options.available();
    } catch {
      return;
    }
    await this.recover(operation);
  }
  public async recover(operation: J): Promise<void> {
    if (this.executing || this.readers)
      throw new MaintenanceError("MINECRAFT_MAINTENANCE", "An operation is still running.");
    this.executing = operation;
    // A terminal result is irrevocable. Only retry cleanup after its commit.
    const recovering =
      operation.status === "succeeded" || operation.status === "failed"
        ? this.cleanup(operation)
        : this.recoverTask(operation);
    this.work = recovering.finally(() => this.release());
    await this.work;
  }
  private task(operation: J): MaintenanceTask<J> {
    const task = this.options.tasks.get(operation.kind);
    if (
      !task ||
      (operation.taskVersion !== task.version &&
        !task.legacyVersions?.includes(operation.taskVersion))
    )
      throw new MaintenanceError(
        "BACKUP_RECOVERY_REQUIRED",
        "The operation journal uses an unsupported task version. Keep Minecraft stopped and inspect it.",
      );
    if (task.destructive && (!task.safetyBackup || !task.safetyBackupVerified))
      throw new Error("Destructive tasks require a verified safety-backup handler.");
    return task;
  }
  private context(operation: J, interrupted = false): TaskContext<J> {
    return { operation, interrupted, checkpoint: (name) => this.checkpoint(operation, name) };
  }
  private async release(): Promise<void> {
    this.executing = null;
    if (this.initialized && !this.closing && !this.active()) {
      try {
        await this.options.gate?.open();
      } catch (error) {
        console.error("Cannot release startup protection", error);
      }
    }
  }
  private async finish(operation: J, status: "succeeded" | "failed", phase: string): Promise<void> {
    operation.status = status;
    operation.phase = phase;
    operation.finishedAt = this.options.now().toISOString();
    operation.recoverOnReconnect = false;
    try {
      operation.checkpoint = "committed";
      await this.options.persist();
    } catch (error) {
      operation.status = "recoveryRequired";
      throw error;
    }
    // Observing a committed result must never send it back through rollback.
    try {
      await this.options.observer?.(operation, "committed");
    } catch (error) {
      console.error("Committed maintenance observer failed", error);
    }
  }
  private async cleanup(operation: J): Promise<void> {
    try {
      await this.options.tasks.get(operation.kind)?.cleanup?.(this.context(operation));
      operation.cleanupComplete = true;
      await this.options.persist();
    } catch (error) {
      operation.cleanupComplete = false;
      console.error("Committed maintenance cleanup needs attention", operation.id, error);
    }
  }
  private async failed(operation: J, error: unknown): Promise<void> {
    operation.error = this.options.describe(error);
    operation.finishedAt = null;
    if (dockerUnavailable(error)) {
      operation.status = "running";
      operation.phase = "Waiting for Docker to recover";
      operation.recoverOnReconnect = true;
    } else {
      operation.status = "recoveryRequired";
      operation.phase = "Recovery needs attention";
      operation.recoverOnReconnect = false;
      try {
        await this.options.tasks.get(operation.kind)?.hold(this.context(operation));
      } catch (holdError) {
        console.error("Cannot hold Minecraft stopped", holdError);
      }
    }
    try {
      await this.options.persist();
    } catch (persistError) {
      operation.status = "recoveryRequired";
      operation.recoverOnReconnect = false;
      console.error("Cannot persist recovery state", persistError);
    }
  }
  private async run(operation: J): Promise<void> {
    const task = this.task(operation);
    const context = this.context(operation);
    let committed = false;
    try {
      await this.checkpoint(operation, "admitted");
      await task.prepare?.(context);
      if (task.destructive) {
        await task.safetyBackup!(context);
        if (!task.safetyBackupVerified!(operation))
          throw new Error("The safety backup is not verified.");
        await this.checkpoint(operation, "safety-ready");
      }
      await task.apply(context);
      await task.verify?.(context);
      await this.options.observer?.(operation, "before-commit");
      await this.finish(operation, "succeeded", "Complete");
      committed = true;
    } catch (error) {
      if (
        operation.status === "recoveryRequired" ||
        dockerUnavailable(error) ||
        (error instanceof MaintenanceError && error.code === "BACKUP_RECOVERY_REQUIRED")
      ) {
        await this.failed(operation, error);
      } else {
        operation.error = this.options.describe(error);
        try {
          await task.recover(context);
          await this.finish(operation, "failed", "Failed; previous state preserved");
          committed = true;
        } catch (recoveryError) {
          await this.failed(operation, recoveryError);
        }
      }
    }
    if (committed) await this.cleanup(operation);
  }
  private async recoverTask(operation: J): Promise<void> {
    try {
      await this.options.gate?.block();
      await this.task(operation).recover(this.context(operation, true));
      operation.error = "The controller was interrupted. Previous server data was preserved.";
      await this.finish(operation, "failed", "Interrupted operation recovered");
      await this.cleanup(operation);
    } catch (error) {
      await this.failed(operation, error);
    }
  }
}
