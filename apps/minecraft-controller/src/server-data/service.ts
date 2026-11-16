import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { ControllerError, isMissing } from "@/errors.js";
import { syncDirectory } from "@/filesystem/atomic-files.js";
import { preserved, safeArchivePath } from "@/data/policy.js";
import type { Immutable } from "@/immutable.js";
import type { ExecutionLease } from "@/maintenance/service.js";
import { preserveCredentials, disableFtbScheduling } from "./settings.js";
const rootEntry = z
  .string()
  .min(1)
  .refine((name) => {
    try {
      return !name.includes("/") && !preserved(name) && safeArchivePath(name) === name;
    } catch {
      return false;
    }
  }, "A replacement checkpoint contains an unsafe top-level entry.");
export const replacementSchema = z
  .object({
    replacementStarted: z.boolean().default(false),
    replacementComplete: z.boolean().default(false),
    originalNames: z.array(rootEntry).default([]),
    stagedNames: z.array(rootEntry).default([]),
    liveDataSafe: z.boolean().default(true),
    rollbackPending: z.boolean().default(false),
  })
  .superRefine((state, ctx) => {
    if (state.replacementComplete && !state.replacementStarted)
      ctx.addIssue({ code: "custom", message: "Completed replacement has no recorded intent." });
    if (
      state.liveDataSafe &&
      (state.rollbackPending || (state.replacementStarted && !state.replacementComplete))
    )
      ctx.addIssue({ code: "custom", message: "Incomplete replacement cannot authorize startup." });
    if (
      new Set(state.originalNames).size !== state.originalNames.length ||
      new Set(state.stagedNames).size !== state.stagedNames.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate replacement paths are unsafe." });
  });
export type ReplacementState = z.infer<typeof replacementSchema>;
export interface ReplacementSession extends ExecutionLease {
  read(): Immutable<ReplacementState>;
  record(patch: Partial<ReplacementState>, checkpoint: string, phase?: string): Promise<void>;
  assertStopped(): Promise<void>;
}
export interface ServerDataOperations {
  prepare(lease: ExecutionLease): Promise<string>;
  staged(lease: ExecutionLease): string;
  preserveAccess(lease: ExecutionLease): Promise<void>;
  enforceSettings(lease: ExecutionLease, worldName: string): Promise<void>;
  replace(session: ReplacementSession): Promise<void>;
  rollback(session: ReplacementSession): Promise<void>;
  cleanup(lease: ExecutionLease): Promise<void>;
}
/** Durable file replacement only; no Docker, backup catalogue or aggregate access. */
export class ServerDataService implements ServerDataOperations {
  public constructor(
    private readonly data: string,
    private readonly recovery: string,
  ) {}
  private work(lease: ExecutionLease): string {
    lease.assertActive();
    z.uuid().parse(lease.id);
    return join(this.recovery, lease.id);
  }
  public staged(lease: ExecutionLease): string {
    return join(this.work(lease), "staged");
  }
  public async prepare(lease: ExecutionLease): Promise<string> {
    const work = this.work(lease);
    await mkdir(this.recovery, { recursive: true, mode: 0o700 });
    await mkdir(join(work, "staged"), { recursive: true, mode: 0o700 });
    await mkdir(join(work, "previous"), { mode: 0o700 });
    if ((await lstat(this.data)).dev !== (await lstat(work)).dev)
      throw new ControllerError(
        "BACKUP_INVALID",
        "Recovery staging and live data must share a filesystem.",
      );
    // Directory fsyncs on moved children do not persist newly created ancestors.
    // Record the rollback workspace's links before it can hold original data.
    await syncDirectory(work);
    await syncDirectory(this.recovery);
    await syncDirectory(dirname(this.recovery));
    return join(work, "staged");
  }
  public async preserveAccess(lease: ExecutionLease): Promise<void> {
    await preserveCredentials(this.data, this.staged(lease));
  }
  public async enforceSettings(lease: ExecutionLease, worldName: string): Promise<void> {
    lease.assertActive();
    await disableFtbScheduling(this.data, worldName);
  }
  private async move(session: ReplacementSession, from: string, to: string): Promise<void> {
    await session.assertStopped();
    await rename(from, to);
    await syncDirectory(dirname(from));
    await syncDirectory(dirname(to));
    await session.record({}, `moved:${basename(from)}`);
  }
  public async replace(session: ReplacementSession): Promise<void> {
    await session.assertStopped();
    const work = this.work(session),
      staged = join(work, "staged"),
      previous = join(work, "previous");
    const originalNames = (await readdir(this.data)).filter((name) => !preserved(name)),
      stagedNames = (await readdir(staged)).filter((name) => !preserved(name));
    await session.record(
      { originalNames, stagedNames, replacementStarted: true, liveDataSafe: false },
      "replacement-planned",
      "Replacing server data",
    );
    for (const name of originalNames)
      await this.move(session, join(this.data, name), join(previous, name));
    for (const name of stagedNames)
      await this.move(session, join(staged, name), join(this.data, name));
    await session.record({ replacementComplete: true }, "replacement-complete");
  }
  public async rollback(session: ReplacementSession): Promise<void> {
    const state = session.read();
    if (!state.replacementStarted) return;
    await session.assertStopped();
    const work = this.work(session),
      previous = join(work, "previous"),
      staged = join(work, "staged");
    const exists = async (path: string) => {
      try {
        await lstat(path);
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    };
    // A verification boot may create new top-level files. They are part of the
    // uncommitted replacement, while every pre-existing unknown entry is in the
    // durable originalNames plan and must be retained/restored.
    for (const name of await readdir(this.data)) {
      if (!preserved(name) && !state.originalNames.includes(name)) {
        await session.assertStopped();
        await rm(join(this.data, name), { recursive: true, force: true });
      }
    }
    for (const name of state.stagedNames) {
      safeArchivePath(name);
      if (
        (await exists(join(previous, name))) ||
        (!state.originalNames.includes(name) && !(await exists(join(staged, name))))
      ) {
        await session.assertStopped();
        await rm(join(this.data, name), { recursive: true, force: true });
      }
    }
    for (const name of state.originalNames) {
      safeArchivePath(name);
      if (await exists(join(previous, name))) {
        await rm(join(this.data, name), { recursive: true, force: true });
        await this.move(session, join(previous, name), join(this.data, name));
      } else if (!(await exists(join(this.data, name))))
        throw new ControllerError(
          "BACKUP_RECOVERY_REQUIRED",
          `Original server data is missing: ${name}. Keep Minecraft stopped.`,
        );
    }
    await syncDirectory(this.data);
    await session.record(
      { replacementStarted: false, replacementComplete: false },
      "rollback-files-complete",
    );
  }
  public async cleanup(lease: ExecutionLease): Promise<void> {
    await rm(this.work(lease), { recursive: true, force: true });
    await mkdir(this.recovery, { recursive: true, mode: 0o700 });
    await syncDirectory(this.recovery);
  }
}
