import {
  maintenanceOperationSchema,
  type MaintenanceOperation,
} from "@minecraft-control-plane/shared/minecraft";
import { ControllerError } from "@/errors.js";
import type { OperationJournal } from "@/tasks/operations.js";
import type { TaskRequest } from "@/tasks/requests.js";
import type { MaintenanceCoordinator } from "./coordinator.js";
export class MaintenanceService {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  public start(): void {
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

  public constructor(
    private readonly coordinator: MaintenanceCoordinator<OperationJournal>,
    private readonly createOperation: (request: TaskRequest) => OperationJournal,
  ) {}
  public get ready(): boolean {
    return this.coordinator.initialized && !this.coordinator.closing;
  }
  public activeJournal(): OperationJournal | null {
    return this.coordinator.active();
  }
  public activeOperation(): MaintenanceOperation | null {
    const op = this.activeJournal();
    return op ? this.present(op) : null;
  }
  public operation(id: string): MaintenanceOperation {
    const op = this.coordinator.operation(id);
    if (!op)
      throw new ControllerError("BACKUP_NOT_FOUND", "The requested operation was not found.");
    return this.present(op);
  }
  private present(op: OperationJournal): MaintenanceOperation {
    const status = this.coordinator.status(op);
    const cleanupBlocked = status === "recoveryRequired" && op.status !== "recoveryRequired";
    return maintenanceOperationSchema.parse({
      ...op,
      status,
      phase: cleanupBlocked ? "Cleanup needs attention" : op.phase,
      error: cleanupBlocked
        ? "The result is committed, but cleanup needs attention. Inspect storage and run make backup-recover."
        : op.error,
      finishedAt: status === "running" || status === "recoveryRequired" ? null : op.finishedAt,
    });
  }
  public submit(request: TaskRequest, reserve: () => void = () => {}): Promise<string> {
    const op = this.createOperation(request);
    return this.coordinator.submit(op, reserve);
  }
  public wait(): Promise<void> {
    return this.coordinator.wait();
  }
  public exclusive<T>(action: () => Promise<T>): Promise<T> {
    return this.coordinator.exclusive(action);
  }
  public assertAvailable(): void {
    this.coordinator.assertAvailable();
  }
  public async recover(): Promise<void> {
    const op = this.coordinator.active();
    if (!op) return;
    await this.coordinator.recover(op);
    if (this.coordinator.active())
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        op.error ?? "Recovery needs attention.",
      );
  }
  public initialize(): Promise<void> {
    return this.coordinator.recoverInterrupted();
  }
  public open(): Promise<void> {
    return this.coordinator.ready();
  }
  public retry(): Promise<void> {
    return this.coordinator.retry();
  }
  public close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    return this.coordinator.close();
  }
}
