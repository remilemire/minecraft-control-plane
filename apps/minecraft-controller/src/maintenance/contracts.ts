import type { Immutable } from "@/immutable.js";
import type { CommitEffect } from "@/transaction.js";

export type OperationStatus = "running" | "succeeded" | "failed" | "recoveryRequired";
export interface OperationRecord {
  id: string;
  kind: string;
  taskVersion: number;
  request: unknown;
  data: unknown;
  result: Record<string, unknown>;
  status: OperationStatus;
  phase: string;
  checkpoint: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  cleanupComplete: boolean;
  recoverOnReconnect: boolean;
  historyOnly: boolean;
}

export interface OperationJournal {
  healthy(): boolean;
  failure(): string | null;
  all(): readonly Immutable<OperationRecord>[];
  get(id: string): Immutable<OperationRecord> | undefined;
  admit(operation: OperationRecord, changes: readonly CommitEffect[]): Promise<void>;
  update(
    id: string,
    update: Partial<
      Pick<
        OperationRecord,
        | "data"
        | "result"
        | "status"
        | "phase"
        | "checkpoint"
        | "finishedAt"
        | "error"
        | "cleanupComplete"
        | "recoverOnReconnect"
      >
    >,
    changes?: readonly CommitEffect[],
  ): Promise<void>;
}

export interface BootIdentityReader {
  inspect(): Promise<{ containerId: string; hostname: string; running: boolean }>;
}
export interface StartupAuthorization {
  block(): Promise<void>;
  open(): Promise<void>;
  boot<T>(containerId: string, action: () => Promise<T>): Promise<T>;
}

export interface StepOptions {
  phase?: string;
  changes?: readonly CommitEffect[];
  result?: Record<string, unknown>;
}

export interface ExecutionLease {
  readonly id: string;
  assertActive(): void;
}

export interface TaskContext<Request, State> extends ExecutionLease {
  readonly request: Immutable<Request>;
  readonly interrupted: boolean;
  state(): Immutable<State>;
  outcome(): "succeeded" | "failed" | null;
  step(checkpoint: string, state: State | Immutable<State>, options?: StepOptions): Promise<void>;
  boot<T>(containerId: string, action: () => Promise<T>): Promise<T>;
}

export interface RawTaskContext extends ExecutionLease {
  assertCurrent(): void;
  readonly interrupted: boolean;
  record(): Immutable<OperationRecord>;
  step(checkpoint: string, data: unknown, options?: StepOptions): Promise<void>;
  boot<T>(containerId: string, action: () => Promise<T>): Promise<T>;
}
export interface TaskFailureContext<State> {
  readonly id: string;
  state(): Immutable<State>;
  assertCurrent(): void;
}

export interface RegisteredTask {
  readonly kind: string;
  readonly version: number;
  prepare(request: unknown): { request: unknown; data: unknown; result: Record<string, unknown> };
  validate(record: Immutable<OperationRecord>): void;
  canBoot(record: Immutable<OperationRecord>): boolean;
  run(context: RawTaskContext): Promise<void>;
  recover(context: RawTaskContext): Promise<void>;
  hold(context: RawTaskContext): Promise<void>;
  cleanup(context: RawTaskContext): Promise<void>;
}
