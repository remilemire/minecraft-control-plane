import { randomUUID } from "node:crypto";
import { ControllerError, dockerUnavailable, publicFailure } from "@/errors.js";
import type { Clock } from "@/time.js";
import type { CommitEffect } from "@/transaction.js";
import type { Immutable } from "@/immutable.js";
import type {
  ExecutionLease,
  OperationJournal,
  OperationRecord,
  RawTaskContext,
  RegisteredTask,
  StartupAuthorization,
} from "./contracts.js";
import { validateTaskRecord } from "./task.js";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

/** Owns admission and terminal decisions, never task-specific data or storage. */
export class MaintenanceCoordinator {
  private ready = false;
  private closing = false;
  private reservation = false;
  private executing: string | null = null;
  private fault: string | null = null;
  private work: Promise<void> = Promise.resolve();
  private admission: { record: OperationRecord; accepted: Promise<string> } | null = null;
  private recovery: Promise<void> | null = null;
  private shortWork: Promise<unknown> | null = null;
  public constructor(
    private readonly journal: OperationJournal,
    private readonly tasks: ReadonlyMap<string, RegisteredTask>,
    private readonly gate: StartupAuthorization,
    private readonly clock: Clock,
    private readonly environment: { available(): Promise<void>; reconcile(): Promise<void> },
  ) {}
  public get failure(): string | null {
    return this.journal.failure() ?? this.fault;
  }
  public active(): Immutable<OperationRecord> | null {
    const id = this.executing ?? this.admission?.record.id;
    const records = this.journal.all();
    return (
      (id ? this.journal.get(id) : undefined) ??
      records.find((op) => op.status === "running" || op.status === "recoveryRequired") ??
      records.find((op) => !op.cleanupComplete) ??
      null
    );
  }
  public operation(id: string): Immutable<OperationRecord> | undefined {
    return this.journal.get(id);
  }
  public latest(): Immutable<OperationRecord> | null {
    return this.journal.all().at(-1) ?? null;
  }
  public status(op: Immutable<OperationRecord>): OperationRecord["status"] {
    if (this.failure && this.active()?.id === op.id) return "recoveryRequired";
    if (this.executing === op.id) return "running";
    return !op.cleanupComplete && (op.status === "succeeded" || op.status === "failed")
      ? "recoveryRequired"
      : op.status;
  }
  private task(op: Pick<OperationRecord, "kind" | "taskVersion">): RegisteredTask {
    const task = this.tasks.get(op.kind);
    if (!task || task.version !== op.taskVersion)
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "The journal contains an unknown task/version. Inspect it before starting Minecraft.",
      );
    return task;
  }
  public validate(op: Immutable<OperationRecord>): void {
    validateTaskRecord(this.tasks, op);
  }
  public assertAvailable(): void {
    if (this.failure || !this.journal.healthy())
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        this.failure ?? "Controller storage needs inspection.",
      );
    if (!this.ready || this.closing)
      throw new ControllerError(
        "BACKUP_CONTROLLER_ERROR",
        "The controller is starting or shutting down.",
      );
    const active = this.active();
    if (active && this.status(active) === "recoveryRequired")
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        active.error ?? "Maintenance recovery needs attention.",
      );
    if (active || this.executing || this.reservation || this.admission || this.recovery)
      throw new ControllerError(
        "MINECRAFT_MAINTENANCE",
        "A Minecraft operation is already in progress.",
      );
  }
  private async holdStorage(error: unknown): Promise<void> {
    this.fault = this.journal.failure() ?? publicFailure(error);
    try {
      await this.gate.block();
    } catch (gateError) {
      console.error("Cannot fence startup", gateError);
    }
  }
  public async exclusive<T>(action: (lease: ExecutionLease) => Promise<T>): Promise<T> {
    this.assertAvailable();
    this.reservation = true;
    const id = randomUUID();
    const lease: ExecutionLease = {
      id,
      assertActive: () => {
        if (!this.reservation || this.shortWork !== work)
          throw new ControllerError("MINECRAFT_MAINTENANCE", "The command lease has expired.");
        if (!this.journal.healthy())
          throw new ControllerError(
            "BACKUP_RECOVERY_REQUIRED",
            this.journal.failure() ?? "Storage needs inspection.",
          );
      },
    };
    const work = Promise.resolve().then(() => action(lease));
    this.shortWork = work;
    try {
      return await work;
    } catch (error) {
      if (
        !this.journal.healthy() ||
        (error instanceof ControllerError && error.code === "BACKUP_RECOVERY_REQUIRED")
      )
        await this.holdStorage(error);
      throw error;
    } finally {
      this.reservation = false;
      this.shortWork = null;
    }
  }
  public submit(
    kind: string,
    request: unknown,
    id: string = randomUUID(),
    changes: readonly CommitEffect[] = [],
  ): Promise<string> {
    const definition = this.tasks.get(kind);
    if (!definition)
      return Promise.reject(new ControllerError("BACKUP_INVALID", "Unknown operation."));
    const prepared = definition.prepare(request);
    const previous =
      this.admission?.record.id === id ? this.admission.record : this.journal.get(id);
    if (previous) {
      if (previous.kind !== kind || canonical(previous.request) !== canonical(prepared.request))
        return Promise.reject(
          new ControllerError(
            "BACKUP_REQUEST_CONFLICT",
            "This request ID belongs to another operation.",
          ),
        );
      return this.admission?.record.id === id ? this.admission.accepted : Promise.resolve(id);
    }
    this.assertAvailable();
    const record: OperationRecord = {
      id,
      kind,
      taskVersion: definition.version,
      ...prepared,
      status: "running",
      phase: "Preparing",
      checkpoint: "admitted",
      startedAt: this.clock.now().toISOString(),
      finishedAt: null,
      error: null,
      cleanupComplete: false,
      recoverOnReconnect: false,
      historyOnly: false,
    };
    this.reservation = true;
    const accepted = Promise.resolve().then(async () => {
      try {
        await this.gate.block();
        await this.journal.admit(record, changes);
        this.executing = id;
        this.work = this.run(id).finally(() => this.release());
        return id;
      } catch (error) {
        await this.holdStorage(error);
        throw error;
      } finally {
        this.reservation = false;
        this.admission = null;
      }
    });
    this.admission = { record, accepted };
    return accepted;
  }
  public async wait(id: string): Promise<void> {
    if (this.admission?.record.id === id) await this.admission.accepted;
    if (this.executing === id) await this.work;
  }
  private record(id: string): Immutable<OperationRecord> {
    const op = this.journal.get(id);
    if (!op) throw new Error("The active journal entry is missing.");
    return op;
  }
  private context(id: string, interrupted = false): RawTaskContext {
    const assertCurrent = () => {
      if (this.executing !== id)
        throw new ControllerError(
          "MINECRAFT_MAINTENANCE",
          "The execution lease is no longer active.",
        );
    };
    const assertActive = () => {
      assertCurrent();
      if (!this.journal.healthy())
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          this.journal.failure() ?? "Storage needs inspection.",
        );
    };
    return {
      id,
      interrupted,
      assertActive,
      assertCurrent,
      record: () => this.record(id),
      step: async (checkpoint, data, options = {}) => {
        assertActive();
        const current = this.record(id);
        await this.journal.update(
          id,
          {
            data,
            checkpoint,
            phase: options.phase ?? current.phase,
            result: { ...current.result, ...options.result },
          },
          options.changes,
        );
      },
      boot: async (containerId, action) => {
        assertActive();
        const op = this.record(id);
        if (!this.task(op).canBoot(op))
          throw new ControllerError(
            "BACKUP_RECOVERY_REQUIRED",
            "Live server files are not safe to boot.",
          );
        await this.journal.update(id, { checkpoint: "boot-safe" });
        return this.gate.boot(containerId, action);
      },
    };
  }
  private async terminal(
    id: string,
    status: "succeeded" | "failed",
    phase: string,
    error: string | null,
  ): Promise<void> {
    await this.journal.update(id, {
      status,
      phase,
      error,
      checkpoint: "committed",
      finishedAt: this.clock.now().toISOString(),
      recoverOnReconnect: false,
    });
  }
  private async cleanup(id: string): Promise<void> {
    try {
      await this.task(this.record(id)).cleanup(this.context(id));
      await this.journal.update(id, { cleanupComplete: true });
    } catch (error) {
      console.error("Committed result retained; cleanup needs attention", id, error);
      if (!this.journal.healthy()) await this.holdStorage(error);
    }
  }
  private async failed(id: string, error: unknown): Promise<void> {
    if (!this.journal.healthy()) {
      await this.holdStorage(error);
      try {
        await this.task(this.record(id)).hold(this.context(id));
      } catch (failure) {
        console.error("Cannot hold the failed task safe", failure);
      }
      return;
    }
    const transient = dockerUnavailable(error);
    try {
      await this.journal.update(id, {
        status: transient ? "running" : "recoveryRequired",
        phase: transient ? "Waiting for Docker to recover" : "Recovery needs attention",
        finishedAt: null,
        error: publicFailure(error),
        recoverOnReconnect: transient,
      });
      if (!transient) await this.task(this.record(id)).hold(this.context(id));
    } catch (failure) {
      await this.holdStorage(failure);
    }
  }
  private async run(id: string): Promise<void> {
    try {
      await this.task(this.record(id)).run(this.context(id));
      await this.terminal(id, "succeeded", "Complete", null);
    } catch (error) {
      if (
        !this.journal.healthy() ||
        dockerUnavailable(error) ||
        (error instanceof ControllerError && error.code === "BACKUP_RECOVERY_REQUIRED")
      ) {
        await this.failed(id, error);
        return;
      }
      try {
        await this.task(this.record(id)).recover(this.context(id));
        await this.terminal(id, "failed", "Failed; previous state preserved", publicFailure(error));
      } catch (failure) {
        await this.failed(id, failure);
        return;
      }
    }
    await this.cleanup(id);
  }
  private async release(): Promise<void> {
    this.executing = null;
    if (this.ready && !this.closing && !this.failure && !this.active()) {
      try {
        await this.gate.open();
      } catch (error) {
        await this.holdStorage(error);
      }
    }
  }
  public async initialize(): Promise<void> {
    if (this.closing)
      throw new ControllerError("BACKUP_CONTROLLER_ERROR", "The controller is shutting down.");
    await this.gate.block();
    for (const op of this.journal.all()) this.validate(op);
    await this.environment.reconcile();
    let op = this.active();
    while (op && op.status !== "recoveryRequired") {
      await this.recoverOperation(op.id);
      const next = this.active();
      if (next?.id === op.id) break;
      op = next;
    }
    this.ready = true;
    if (!this.closing && !this.active() && !this.failure) await this.gate.open();
  }
  private async recoverOperation(id: string): Promise<void> {
    this.executing = id;
    this.work = (async () => {
      try {
        const op = this.record(id);
        if (op.status !== "succeeded" && op.status !== "failed") {
          await this.task(op).recover(this.context(id, true));
          await this.terminal(
            id,
            "failed",
            "Interrupted operation recovered",
            "The interrupted operation was recovered. Previous server data was preserved.",
          );
        }
        await this.cleanup(id);
      } catch (error) {
        await this.failed(id, error);
      }
    })().finally(() => this.release());
    await this.work;
  }
  public recover(): Promise<void> {
    if (this.closing)
      return Promise.reject(
        new ControllerError("BACKUP_CONTROLLER_ERROR", "The controller is shutting down."),
      );
    if (this.recovery) return this.recovery;
    if (this.executing || this.reservation || this.admission)
      return Promise.reject(
        new ControllerError("MINECRAFT_MAINTENANCE", "An operation is still running."),
      );
    const recovering = Promise.resolve()
      .then(async () => {
        try {
          await this.gate.block();
          await this.environment.reconcile();
          for (const op of this.journal.all()) this.validate(op);
        } catch (error) {
          await this.holdStorage(error);
          throw error;
        }
        this.fault = null;
        let op = this.active();
        while (op) {
          await this.recoverOperation(op.id);
          const next = this.active();
          if (next?.id === op.id) break;
          op = next;
        }
        if (this.active() || this.failure)
          throw new ControllerError(
            "BACKUP_RECOVERY_REQUIRED",
            this.failure ?? this.active()?.error ?? "Recovery needs attention.",
          );
        if (!this.closing) await this.gate.open();
      })
      .finally(() => {
        this.recovery = null;
      });
    this.recovery = recovering;
    return recovering;
  }
  public async retry(): Promise<void> {
    const op = this.active();
    if (
      !this.ready ||
      this.closing ||
      this.executing ||
      this.reservation ||
      this.admission ||
      this.recovery ||
      this.failure ||
      !op?.recoverOnReconnect
    )
      return;
    try {
      await this.environment.available();
    } catch {
      return;
    }
    await this.recover();
  }
  public async close(): Promise<void> {
    this.closing = true;
    await this.gate.block();
    if (this.admission) await this.admission.accepted.catch(() => {});
    if (this.shortWork) await this.shortWork.catch(() => {});
    await this.work;
    if (this.recovery) await this.recovery.catch(() => {});
  }
}
