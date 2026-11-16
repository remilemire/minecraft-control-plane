import { z } from "zod";
import {
  backupRecordSchema,
  backupSchedulesInputSchema,
  maintenanceOperationSchema,
} from "@minecraft-control-plane/shared/minecraft";
import type { OperationRecord } from "@/maintenance/service.js";

export const operationSchema = z
  .object({
    id: z.uuid(),
    kind: z.string().min(1),
    taskVersion: z.number().int().nonnegative(),
    request: z.json(),
    data: z.json(),
    result: z.record(z.string(), z.json()),
    status: z.enum(["running", "succeeded", "failed", "recoveryRequired"]),
    phase: z.string(),
    checkpoint: z.string().nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    error: z.string().nullable(),
    cleanupComplete: z.boolean(),
    recoverOnReconnect: z.boolean(),
    historyOnly: z.boolean(),
  })
  .superRefine((operation, context) => {
    const terminal = operation.status === "succeeded" || operation.status === "failed";
    if (
      terminal
        ? !operation.finishedAt || operation.recoverOnReconnect
        : operation.finishedAt !== null || operation.cleanupComplete
    )
      context.addIssue({
        code: "custom",
        message: "Inconsistent operation lifecycle requires inspection.",
      });
    if (operation.status === "recoveryRequired" && operation.recoverOnReconnect)
      context.addIssue({
        code: "custom",
        message: "An inspection hold cannot automatically reconnect.",
      });
  });
export const stateSchema = z
  .object({
    schemaVersion: z.literal(2),
    enabled: backupSchedulesInputSchema,
    nextRuns: z.object({
      hourly: z.iso.datetime().nullable(),
      daily: z.iso.datetime().nullable(),
      weekly: z.iso.datetime().nullable(),
      monthly: z.iso.datetime().nullable(),
    }),
    timezone: z.string(),
    backups: z.array(backupRecordSchema),
    operations: z.array(operationSchema),
    pendingDeletes: z.array(z.uuid()),
  })
  .superRefine((state, context) => {
    if (
      state.operations.filter((op) => op.status === "running" || op.status === "recoveryRequired")
        .length > 1
    )
      context.addIssue({ code: "custom", message: "Multiple unfinished operations are unsafe." });
    for (const records of [state.operations, state.backups])
      if (new Set(records.map((record) => record.id)).size !== records.length)
        context.addIssue({ code: "custom", message: "Duplicate identifiers are unsafe." });
    if (new Set(state.pendingDeletes).size !== state.pendingDeletes.length)
      context.addIssue({ code: "custom", message: "Duplicate deletion intents are unsafe." });
    if (state.pendingDeletes.some((id) => !state.backups.some((backup) => backup.id === id)))
      context.addIssue({ code: "custom", message: "A deletion intent has no catalogue record." });
  });
export type ControllerState = z.infer<typeof stateSchema>;

export function emptyState(timezone: string): ControllerState {
  return {
    schemaVersion: 2,
    timezone,
    enabled: { hourly: false, daily: false, weekly: false, monthly: false },
    nextRuns: { hourly: null, daily: null, weekly: null, monthly: null },
    backups: [],
    operations: [],
    pendingDeletes: [],
  };
}

/** One-time decoding of the deployed flat journal, not an archive/import feature. */
export function decodeState(input: unknown): ControllerState {
  const envelope = z.object({ schemaVersion: z.number() }).parse(input);
  if (envelope.schemaVersion === 2) return stateSchema.parse(input);
  if (envelope.schemaVersion !== 1) throw new Error("Unsupported controller state version.");
  const old = z
    .object({
      schemaVersion: z.literal(1),
      enabled: backupSchedulesInputSchema,
      nextRuns: stateSchema.shape.nextRuns,
      timezone: z.string(),
      backups: z.array(backupRecordSchema),
      operations: z.array(maintenanceOperationSchema.passthrough()),
    })
    .parse(input);
  const operations: OperationRecord[] = old.operations.map((op) => {
    const version = z
      .number()
      .int()
      .min(0)
      .max(1)
      .parse(op.taskVersion ?? 0);
    const cleanupComplete = z.boolean().parse(op.cleanupComplete ?? false);
    const historyOnly = op.kind === "migration";
    if (
      historyOnly &&
      (op.status === "running" || op.status === "recoveryRequired" || !cleanupComplete)
    )
      throw new Error(
        "An unfinished retired migration exists. Recover it with the previous release before upgrading.",
      );
    if (
      op.kind !== "restore" &&
      (op.replacementStarted === true ||
        op.replacementComplete === true ||
        [op.originalNames, op.stagedNames].some((names) => Array.isArray(names) && names.length))
    )
      throw new Error("Restore checkpoints belong to another task.");
    const data = {
      containerId: op.containerId ?? null,
      wasRunning: op.wasRunning ?? false,
      restartPolicy: op.restartPolicy ?? null,
      stoppedByOperation: op.stoppedByOperation ?? false,
      savingDisabled: op.savingDisabled ?? false,
      ...(op.kind === "backup" ? { backupId: op.backupId } : {}),
      ...(op.kind === "restore"
        ? {
            safetyBackupId: op.safetyBackupId,
            safetyVerified: op.safetyBackupId !== null,
            replacementStarted: op.replacementStarted ?? false,
            replacementComplete: op.replacementComplete ?? false,
            originalNames: op.originalNames ?? [],
            stagedNames: op.stagedNames ?? [],
            liveDataSafe: op.replacementStarted !== true || op.replacementComplete === true,
          }
        : {}),
    };
    return {
      id: op.id,
      kind: op.kind,
      taskVersion: historyOnly ? version : 2,
      request:
        op.kind === "restore"
          ? { backupId: op.backupId }
          : op.kind === "backup"
            ? { origin: op.origin ?? "manual", tiers: op.tiers ?? [] }
            : {},
      data,
      result: { backupId: op.backupId, safetyBackupId: op.safetyBackupId },
      status: op.status,
      phase: op.phase,
      checkpoint: z
        .string()
        .nullable()
        .parse(op.checkpoint ?? null),
      startedAt: op.startedAt,
      // The first journal format stamped inspection holds with a finish time.
      finishedAt: ["succeeded", "failed"].includes(op.status) ? op.finishedAt : null,
      error: op.error,
      cleanupComplete,
      recoverOnReconnect: z.boolean().parse(op.recoverOnReconnect ?? false),
      historyOnly,
    };
  });
  return stateSchema.parse({ ...old, schemaVersion: 2, operations, pendingDeletes: [] });
}
