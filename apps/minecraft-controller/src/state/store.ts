import { journalSchema } from "@/tasks/operations.js";
import { ControllerError } from "@/errors.js";
import {
  backupRecordSchema,
  backupSchedulesInputSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicJson } from "@/state/atomic-files.js";
export { atomicJson, atomicText, syncDirectory } from "@/state/atomic-files.js";
import { z } from "zod";
import { isMissing } from "@/errors.js";

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
export type ControllerState = z.infer<typeof stateSchema>;

export class ControllerStore {
  private current: ControllerState | undefined;
  public get data(): ControllerState {
    if (!this.current) throw new Error("Controller state has not been loaded.");
    return this.current;
  }
  public async initialize(timezone: string): Promise<void> {
    this.current = await this.load(timezone);
  }
  public async persist(): Promise<void> {
    try {
      await this.save(this.data);
    } catch (cause) {
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "The maintenance journal could not be persisted. Startup remains blocked.",
        { cause },
      );
    }
  }

  private writes: Promise<void> = Promise.resolve();
  public constructor(public readonly root: string) {}

  public async load(timezone: string): Promise<ControllerState> {
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
        enabled: { hourly: false, daily: false, weekly: false, monthly: false },
        nextRuns: { hourly: null, daily: null, weekly: null, monthly: null },
        timezone,
        migrated: false,
        backups: [],
        operations: [],
        legacySources: [],
      };
    }
  }

  public save(state: ControllerState): Promise<void> {
    const snapshot = stateSchema.parse(structuredClone(state));
    const write = this.writes.then(() => atomicJson(join(this.root, "state.json"), snapshot));
    this.writes = write.catch(() => undefined);
    return write;
  }
}
