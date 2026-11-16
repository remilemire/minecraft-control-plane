import { randomUUID } from "node:crypto";
import type { BackupTier } from "@minecraft-control-plane/shared/minecraft";
import { journalSchema, type OperationJournal } from "./operations.js";
export type TaskRequest =
  | { kind: "backup"; requestId: string; origin?: "manual" | "scheduled"; tiers?: BackupTier[] }
  | { kind: "restore"; requestId: string; backupId: string }
  | { kind: "start" | "stop" | "restart"; requestId?: string };
export function createOperation(request: TaskRequest, now: () => Date): OperationJournal {
  const op = journalSchema.parse({
    id: request.requestId ?? randomUUID(),
    kind: request.kind,
    taskVersion: 1,
    status: "running",
    phase: "Preparing",
    startedAt: now().toISOString(),
    finishedAt: null,
    backupId: request.kind === "restore" ? request.backupId : null,
    safetyBackupId: null,
    error: null,
    ...(request.kind === "backup"
      ? { origin: request.origin ?? "manual", tiers: request.tiers ?? [] }
      : {}),
  });
  return op;
}
