import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  BackupRecord,
  BackupSchedulesInput,
  BackupTier,
} from "@minecraft-control-plane/shared/minecraft";
import { backupRecordSchema } from "@minecraft-control-plane/shared/minecraft";
import { ControllerError, isMissing } from "@/errors.js";
import { snapshot, type Immutable } from "@/immutable.js";
import type { OperationJournal, OperationRecord } from "@/maintenance/service.js";
import type { CommitEffect } from "@/transaction.js";
import { atomicJson, atomicText, syncDirectory } from "@/filesystem/atomic-files.js";
import { decodeState, emptyState, stateSchema, type ControllerState } from "./model.js";

export type { CommitEffect } from "@/transaction.js";
type ScheduleTimes = Record<BackupTier, string | null>;
export interface ScheduleView {
  enabled: BackupSchedulesInput;
  nextRuns: ScheduleTimes;
  timezone: string;
}
export interface CatalogueStore {
  list(): readonly Immutable<BackupRecord>[];
  pendingDeletes(): readonly string[];
  put(record: BackupRecord | Immutable<BackupRecord>): CommitEffect;
  memberships(records: readonly { id: string; tiers: readonly BackupTier[] }[]): CommitEffect;
  beginDelete(id: string): CommitEffect;
  finishDelete(id: string): CommitEffect;
  commit(changes: readonly CommitEffect[]): Promise<void>;
}
export interface ScheduleStore {
  read(): Immutable<ScheduleView>;
  configure(value: ScheduleView): CommitEffect;
  consume(expected: ScheduleTimes, next: ScheduleTimes): CommitEffect;
  commit(changes: readonly CommitEffect[]): Promise<void>;
}

/** Owns the only mutable aggregate. Views and commit participants cannot expose it. */
export class StateService {
  private current: ControllerState | undefined;
  private fault: string | null = null;
  private writes: Promise<void> = Promise.resolve();
  private readonly effects = new WeakMap<CommitEffect, (draft: ControllerState) => void>();
  public constructor(
    private readonly root: string,
    private readonly timezone: string,
    private readonly validateOperation: (record: Immutable<OperationRecord>) => void,
  ) {}
  private data(): ControllerState {
    if (!this.current) throw new Error("Controller state is not initialized.");
    return this.current;
  }
  private effect(apply: (draft: ControllerState) => void): CommitEffect {
    const token = Object.freeze({}) as CommitEffect;
    this.effects.set(token, apply);
    return token;
  }
  private validate(value: unknown): ControllerState {
    const parsed = stateSchema.parse(value);
    for (const record of parsed.operations) this.validateOperation(snapshot(record));
    return parsed;
  }
  private unavailable(cause?: unknown): ControllerError {
    return new ControllerError(
      "BACKUP_RECOVERY_REQUIRED",
      this.fault ?? "Controller storage needs inspection.",
      { cause },
    );
  }
  private async commit(changes: readonly CommitEffect[]): Promise<void> {
    const apply = changes.map((change) => {
      const effect = this.effects.get(change);
      if (!effect) throw new Error("A commit participant belongs to another state store.");
      return effect;
    });
    const write = this.writes.then(async () => {
      if (this.fault) throw this.unavailable();
      const draft = structuredClone(this.data());
      for (const change of apply) change(draft);
      const next = this.validate(draft);
      try {
        await atomicJson(join(this.root, "state.json"), next);
      } catch (cause) {
        // Rename may have succeeded before a failed fsync. Hold both known and
        // uncertain failures, retaining the last published immutable state.
        this.fault =
          "Controller state could not be durably committed. Inspect storage and retry maintenance recovery; startup remains blocked.";
        throw this.unavailable(cause);
      }
      this.current = next;
    });
    this.writes = write.catch(() => {});
    await write;
  }
  public async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await syncDirectory(dirname(this.root));
    let loaded: ControllerState;
    try {
      loaded = decodeState(JSON.parse(await readFile(join(this.root, "state.json"), "utf8")));
    } catch (error) {
      if (!isMissing(error)) throw error;
      const exists = async (path: string) => {
        try {
          await stat(path);
          return true;
        } catch (error) {
          if (isMissing(error)) return false;
          throw error;
        }
      };
      const remnants = async (name: string) => {
        const path = join(dirname(this.root), name);
        return (await exists(path)) && (await readdir(path)).length > 0;
      };
      if (
        (await readdir(this.root)).length ||
        (await remnants("backup-recovery")) ||
        (await remnants("backups"))
      )
        throw new Error(
          "The journal is missing from an initialized installation. Startup remains blocked.",
        );
      loaded = emptyState(this.timezone);
    }
    const next = this.validate(loaded);
    try {
      await atomicJson(join(this.root, "state.json"), next);
      await atomicText(join(this.root, "initialized"), "2\n");
    } catch (cause) {
      this.fault = "Controller state storage cannot be committed. Startup remains blocked.";
      throw this.unavailable(cause);
    }
    this.current = next;
    this.fault = null;
  }
  /** Only called while admission is fenced and execution is stopped. */
  public async reopen(): Promise<void> {
    await this.writes;
    await this.initialize();
  }
  public journal(): OperationJournal {
    return {
      healthy: () => this.current !== undefined && this.fault === null,
      failure: () => this.fault,
      all: () => snapshot(this.data().operations),
      get: (id) => {
        const value = this.data().operations.find((op) => op.id === id);
        return value ? snapshot(value) : undefined;
      },
      admit: (operation, changes) => {
        const saved = structuredClone(operation);
        return this.commit([
          this.effect((draft) => {
            if (draft.operations.some((op) => op.id === saved.id))
              throw new Error("Duplicate operation admission.");
            draft.operations.push(structuredClone(saved) as ControllerState["operations"][number]);
          }),
          ...changes,
        ]);
      },
      update: (id, update, changes = []) => {
        const saved = structuredClone(update);
        return this.commit([
          this.effect((draft) => {
            const op = draft.operations.find((op) => op.id === id);
            if (!op) throw new Error("The operation no longer exists.");
            Object.assign(op, saved);
          }),
          ...changes,
        ]);
      },
    };
  }
  public catalogue(): CatalogueStore {
    return {
      list: () => snapshot(this.data().backups),
      pendingDeletes: () => snapshot(this.data().pendingDeletes),
      put: (record) => {
        const value = backupRecordSchema.parse(record);
        return this.effect((draft) => {
          const existing = draft.backups.find((backup) => backup.id === value.id);
          if (existing && JSON.stringify(existing) !== JSON.stringify(value))
            throw new Error("A backup ID cannot be reused.");
          if (!existing) draft.backups.push(value);
        });
      },
      memberships: (records) => {
        const values = structuredClone(records);
        return this.effect((draft) => {
          for (const value of values) {
            const record = draft.backups.find((record) => record.id === value.id);
            if (record) record.tiers = [...value.tiers];
          }
        });
      },
      beginDelete: (id) =>
        this.effect((draft) => {
          if (!draft.backups.some((record) => record.id === id))
            throw new ControllerError("BACKUP_NOT_FOUND", "The backup no longer exists.");
          if (!draft.pendingDeletes.includes(id)) draft.pendingDeletes.push(id);
        }),
      finishDelete: (id) =>
        this.effect((draft) => {
          draft.backups = draft.backups.filter((record) => record.id !== id);
          draft.pendingDeletes = draft.pendingDeletes.filter((pending) => pending !== id);
        }),
      commit: (changes) => this.commit(changes),
    };
  }
  public schedules(): ScheduleStore {
    return {
      read: () => {
        const state = this.data();
        return snapshot({
          enabled: state.enabled,
          nextRuns: state.nextRuns,
          timezone: state.timezone,
        });
      },
      configure: (value) => {
        const next = structuredClone(value);
        return this.effect((draft) => {
          draft.enabled = next.enabled;
          draft.nextRuns = next.nextRuns;
          draft.timezone = next.timezone;
        });
      },
      consume: (expected, next) => {
        const before = structuredClone(expected),
          after = structuredClone(next);
        return this.effect((draft) => {
          if (JSON.stringify(draft.nextRuns) !== JSON.stringify(before))
            throw new Error("Schedule consumption is stale.");
          draft.nextRuns = after;
        });
      },
      commit: (changes) => this.commit(changes),
    };
  }
}
