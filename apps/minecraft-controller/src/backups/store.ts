import {
  backupRecordSchema,
  backupSchedulesInputSchema,
  maintenanceOperationSchema,
  backupTierSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DISABLED_SCHEDULES } from "./schedules.js";
import { isMissing } from "./errors.js";

export const restartPolicySchema = z.object({
  Name: z.string(),
  MaximumRetryCount: z.number().int().nonnegative().optional(),
});
export type RestartPolicy = z.infer<typeof restartPolicySchema>;
export const journalSchema = maintenanceOperationSchema.extend({
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
const stateSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: backupSchedulesInputSchema,
  nextRuns: scheduleTimesSchema,
  timezone: z.string(),
  migrated: z.boolean(),
  backups: z.array(backupRecordSchema),
  operations: z.array(journalSchema),
  legacySources: z.array(z.string()),
});
export type BackupState = z.infer<typeof stateSchema>;

export async function atomicJson(path: string, value: unknown): Promise<void> {
  await atomicText(path, JSON.stringify(value));
}

export async function atomicText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, "wx", 0o600);
  try {
    await file.writeFile(value);
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, path);
  await syncDirectory(dirname(path));
}

export async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export class BackupStore {
  private writes: Promise<void> = Promise.resolve();
  public constructor(public readonly root: string) {}

  public async load(timezone: string): Promise<BackupState> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    try {
      return stateSchema.parse(JSON.parse(await readFile(join(this.root, "state.json"), "utf8")));
    } catch (error) {
      if (!isMissing(error)) throw error; // Never reset damaged state around live recovery data.
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
