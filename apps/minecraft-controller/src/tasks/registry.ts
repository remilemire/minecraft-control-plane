import type { MaintenanceTask, TaskHandlers, TaskContext } from "@/maintenance/coordinator.js";
import type { OperationJournal, OperationKind } from "./operations.js";
// A validated discriminant is the sole narrowing boundary between the registry
// and typed handlers. Handlers receive validated, narrowed operations.
export function registerTask<K extends OperationKind>(
  registry: Map<string, MaintenanceTask<OperationJournal>>,
  kind: K,
  task: MaintenanceTask<Extract<OperationJournal, { kind: K }>>,
): void {
  type Operation = Extract<OperationJournal, { kind: K }>;
  const operation = (op: OperationJournal): Operation => {
    if (op.kind !== kind) throw new Error("Task registry kind mismatch");
    return op as Operation;
  };
  const context = (ctx: TaskContext<OperationJournal>): TaskContext<Operation> => ({
    ...ctx,
    operation: operation(ctx.operation),
  });
  const prepare = task.prepare?.bind(task),
    verify = task.verify?.bind(task),
    cleanup = task.cleanup?.bind(task),
    matches = task.matchesRequest?.bind(task);
  const common: TaskHandlers<OperationJournal> = {
    version: task.version,
    ...(task.legacyVersions ? { legacyVersions: task.legacyVersions } : {}),
    ...(matches ? { matchesRequest: (a, b) => matches(operation(a), operation(b)) } : {}),
    ...(prepare ? { prepare: (ctx) => prepare(context(ctx)) } : {}),
    apply: (ctx) => task.apply(context(ctx)),
    recover: (ctx) => task.recover(context(ctx)),
    hold: (ctx) => task.hold(context(ctx)),
    ...(verify ? { verify: (ctx) => verify(context(ctx)) } : {}),
    ...(cleanup ? { cleanup: (ctx) => cleanup(context(ctx)) } : {}),
  };
  if (task.destructive) {
    registry.set(kind, {
      ...common,
      destructive: true,
      safetyBackup: (ctx) => task.safetyBackup(context(ctx)),
      safetyBackupVerified: (op) => task.safetyBackupVerified(operation(op)),
    });
  } else registry.set(kind, common);
}
