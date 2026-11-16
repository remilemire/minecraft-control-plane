import {
  maintenanceOperationSchema,
  type MaintenanceOperation,
} from "@minecraft-control-plane/shared/minecraft";
import { ControllerError } from "@/errors.js";
import type { Immutable } from "@/immutable.js";
import type { CommitEffect } from "@/transaction.js";
import type { ExecutionLease, OperationRecord } from "./contracts.js";
import type { MaintenanceCoordinator } from "./coordinator.js";

export type {
  TaskContext,
  TaskFailureContext,
  ExecutionLease,
  RegisteredTask,
  OperationRecord,
  OperationJournal,
} from "./contracts.js";
export { defineTask, validateTaskRecord } from "./task.js";
export interface OperationQuery {
  operation(id: string): MaintenanceOperation;
  activeOperation(): MaintenanceOperation | null;
  latestOperation(): MaintenanceOperation | null;
}
export interface MaintenanceApi extends OperationQuery {
  recover(): Promise<void>;
}
export interface Admission extends MaintenanceApi {
  submit(
    kind: string,
    request: unknown,
    id?: string,
    changes?: readonly CommitEffect[],
  ): Promise<string>;
  wait(id: string): Promise<void>;
  exclusive<T>(action: (lease: ExecutionLease) => Promise<T>): Promise<T>;
}

/** Application-facing maintenance API. All operation projections have one owner. */
export class MaintenanceService implements Admission {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  public constructor(private readonly coordinator: MaintenanceCoordinator) {}
  private present(op: Immutable<OperationRecord>): MaintenanceOperation {
    const status = this.coordinator.status(op);
    const cleanup = status === "recoveryRequired" && ["succeeded", "failed"].includes(op.status);
    return maintenanceOperationSchema.parse({
      id: op.id,
      kind: op.kind,
      status,
      phase: cleanup ? "Cleanup needs attention" : op.phase,
      startedAt: op.startedAt,
      finishedAt: status === "running" || status === "recoveryRequired" ? null : op.finishedAt,
      backupId: op.result.backupId ?? null,
      safetyBackupId: op.result.safetyBackupId ?? null,
      error:
        (this.coordinator.active()?.id === op.id ? this.coordinator.failure : null) ??
        (cleanup
          ? "The result is committed, but cleanup needs attention. Inspect storage and run make backup-recover."
          : op.error),
    });
  }
  public operation(id: string): MaintenanceOperation {
    const op = this.coordinator.operation(id);
    if (!op)
      throw new ControllerError("BACKUP_NOT_FOUND", "The requested operation was not found.");
    return this.present(op);
  }
  public activeOperation(): MaintenanceOperation | null {
    const op = this.coordinator.active();
    return op ? this.present(op) : null;
  }
  public latestOperation(): MaintenanceOperation | null {
    const op = this.coordinator.latest();
    return op ? this.present(op) : null;
  }
  public submit(
    kind: string,
    request: unknown,
    id?: string,
    changes: readonly CommitEffect[] = [],
  ): Promise<string> {
    return this.coordinator.submit(kind, request, id, changes);
  }
  public wait(id: string): Promise<void> {
    return this.coordinator.wait(id);
  }
  public exclusive<T>(action: (lease: ExecutionLease) => Promise<T>): Promise<T> {
    return this.coordinator.exclusive(action);
  }
  public recover(): Promise<void> {
    return this.coordinator.recover();
  }
  public initialize(): Promise<void> {
    return this.coordinator.initialize();
  }
  public start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = async () => {
      try {
        await this.coordinator.retry();
      } catch (error) {
        console.error("Maintenance recovery", error);
      }
      if (!this.stopped)
        this.timer = setTimeout(() => {
          void tick();
        }, 1000);
    };
    this.timer = setTimeout(() => {
      void tick();
    }, 1000);
  }
  public close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    return this.coordinator.close();
  }
}
