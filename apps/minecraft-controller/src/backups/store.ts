import {
  backupRecordSchema,
  backupSchedulesInputSchema,
  maintenanceOperationSchema,
  backupTierSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicJson } from "@/maintenance/atomic-files.js";
export { atomicJson, atomicText, syncDirectory } from "@/maintenance/atomic-files.js";
import { z } from "zod";
import { DISABLED_SCHEDULES } from "./schedules.js";
import { isMissing } from "./errors.js";

export const restartPolicySchema = z.object({
  Name: z.string(),
  MaximumRetryCount: z.number().int().nonnegative().optional(),
});
export type RestartPolicy = z.infer<typeof restartPolicySchema>;
export const journalSchema = maintenanceOperationSchema.extend({
  taskVersion: z.number().int().nonnegative().default(0),
  checkpoint: z.string().nullable().default(null),
  recoverOnReconnect: z.boolean().default(false),
  cleanupComplete: z.boolean().default(false),
  origin: z.enum(["manual", "scheduled"]).default("manual"),
  tiers: z.array(backupTierSchema).default([]),
  containerId: z.string().nullable().default(null),
  wasRunning: z.boolean().default(false),
  restartPolicy: restartPolicySchema.nullable().default(null),
  savingDisabled: z.boolean().default(false),
  stoppedByOperation: z.boolean().default(false),
  replacementStarted: z.boolean().default(false),
  replacementComplete: z.boolean().default(false),
  originalNames: z.array(z.string()).default([]),
  stagedNames: z.array(z.string()).default([]),
});
export type OperationJournal = z.infer<typeof journalSchema>;
const scheduleTimesSchema = z.object({
  hourly: z.iso.datetime().nullable(),
  daily: z.iso.datetime().nullable(),
  weekly: z.iso.datetime().nullable(),
  monthly: z.iso.datetime().nullable(),
});
const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: backupSchedulesInputSchema,
    nextRuns: scheduleTimesSchema,
    timezone: z.string(),
    migrated: z.boolean(),
    backups: z.array(backupRecordSchema),
    operations: z.array(journalSchema),
    legacySources: z.array(z.string()),
  })
  .superRefine((state, context) => {
    if (
      state.operations.filter((op) => op.status === "running" || op.status === "recoveryRequired")
        .length > 1
    )
      context.addIssue({
        code: "custom",
        message: "Multiple active maintenance operations are unsafe.",
      });
    if (
      new Set(state.operations.map((op) => op.id)).size !== state.operations.length ||
      new Set(state.backups.map((backup) => backup.id)).size !== state.backups.length
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate journal or catalogue identifiers are unsafe.",
      });
  });
export type BackupState = z.infer<typeof stateSchema>;

export class BackupStore {
  private writes: Promise<void> = Promise.resolve();
  public constructor(public readonly root: string) {}

  public async load(timezone: string): Promise<BackupState> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    try {
      return stateSchema.parse(JSON.parse(await readFile(join(this.root, "state.json"), "utf8")));
    } catch (error) {
      if (!isMissing(error)) throw error; // Never reset damaged state around live recovery data.
      const exists = async (path: string) => {
        try {
          await stat(path);
          return true;
        } catch (error) {
          if (isMissing(error)) return false;
          throw error;
        }
      };
      const parent = dirname(this.root);
      const remnants = async (name: string) => {
        const path = join(parent, name);
        return (await exists(path)) && (await readdir(path)).length > 0;
      };
      if (
        (await exists(join(this.root, "initialized"))) ||
        (await remnants("backup-recovery")) ||
        (await remnants("backups")) ||
        (await readdir(this.root)).length > 0
      )
        throw new Error(
          "The maintenance journal is missing from an initialized installation. Startup remains blocked.",
        );
      return {
        schemaVersion: 1,
        enabled: { ...DISABLED_SCHEDULES },
        nextRuns: { hourly: null, daily: null, weekly: null, monthly: null },
        timezone,
        migrated: false,
        backups: [],
        operations: [],
        legacySources: [],
      };
    }
  }

  public save(state: BackupState): Promise<void> {
    const snapshot = stateSchema.parse(structuredClone(state));
    const write = this.writes.then(() => atomicJson(join(this.root, "state.json"), snapshot));
    this.writes = write.catch(() => undefined);
    return write;
  }
}
