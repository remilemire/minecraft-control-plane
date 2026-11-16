import { z } from "zod";
import { backupTierSchema } from "@minecraft-control-plane/shared/minecraft";
import { maintenanceJournalSchema } from "@/maintenance/journal.js";
import { restartPolicySchema } from "@/runtime/contracts.js";
const serverOperation = maintenanceJournalSchema.extend({
  containerId: z.string().nullable().default(null),
  wasRunning: z.boolean().default(false),
  restartPolicy: restartPolicySchema.nullable().default(null),
  stoppedByOperation: z.boolean().default(false),
  savingDisabled: z.boolean().default(false),
});
const backupOperation = serverOperation.extend({
  kind: z.literal("backup"),
  origin: z.enum(["manual", "scheduled"]).default("manual"),
  tiers: z.array(backupTierSchema).default([]),
});
const restoreOperation = serverOperation.extend({
  kind: z.literal("restore"),
  replacementStarted: z.boolean().default(false),
  replacementComplete: z.boolean().default(false),
  originalNames: z.array(z.string()).default([]),
  stagedNames: z.array(z.string()).default([]),
});
// Version-0/1 migration entries remain readable/recoverable; no new import is admitted.
const migrationOperation = serverOperation.extend({ kind: z.literal("migration") });
const typedJournalSchema = z.discriminatedUnion("kind", [
  backupOperation,
  restoreOperation,
  migrationOperation,
  serverOperation.extend({ kind: z.literal("start") }),
  serverOperation.extend({ kind: z.literal("stop") }),
  serverOperation.extend({ kind: z.literal("restart") }),
]);
export const journalSchema = z.preprocess((input, context) => {
  if (typeof input === "object" && input !== null && "kind" in input && input.kind !== "restore") {
    const value = input as Record<string, unknown>;
    if (
      value.replacementStarted === true ||
      value.replacementComplete === true ||
      [value.originalNames, value.stagedNames].some(
        (names) => Array.isArray(names) && names.length > 0,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Restore checkpoints cannot belong to another task.",
      });
      return z.NEVER;
    }
  }
  return input;
}, typedJournalSchema);
export type OperationJournal = z.infer<typeof journalSchema>;
export type BackupOperation = Extract<OperationJournal, { kind: "backup" }>;
export type RestoreOperation = Extract<OperationJournal, { kind: "restore" }>;
export type PowerOperation = Extract<OperationJournal, { kind: "start" | "stop" | "restart" }>;
export type OperationKind = OperationJournal["kind"];
