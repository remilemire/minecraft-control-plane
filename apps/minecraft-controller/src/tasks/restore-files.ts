import { lstat, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { ControllerError, isMissing } from "@/errors.js";
import { syncDirectory } from "@/state/atomic-files.js";
import type { ControllerStore } from "@/state/store.js";
import type { MinecraftRuntime } from "@/runtime/contracts.js";
import type { TaskContext } from "@/maintenance/coordinator.js";
import type { BackupService } from "@/backups/service.js";
import { preserved, safeArchivePath } from "@/runtime/data-policy.js";
import { disableFtbScheduling, preserveCredentials } from "./restore-settings.js";
import type { RestoreOperation } from "./operations.js";
import type { ServerTaskLifecycle } from "./server-lifecycle.js";
export class RestoreFiles {
  public constructor(
    private readonly dataPath: string,
    private readonly workRoot: string,
    private readonly backups: BackupService,
    private readonly runtime: MinecraftRuntime,
    private readonly store: ControllerStore,
    private readonly lifecycle: ServerTaskLifecycle,
  ) {}
  private async move(
    context: TaskContext<RestoreOperation>,
    from: string,
    to: string,
  ): Promise<void> {
    await rename(from, to);
    await syncDirectory(dirname(from));
    await syncDirectory(dirname(to));
    await context.checkpoint(`moved:${basename(from)}`);
  }
  public async replace(context: TaskContext<RestoreOperation>): Promise<void> {
    const op = context.operation;
    const work = join(this.workRoot, op.id);
    const staged = join(work, "staged");
    const previous = join(work, "previous");
    const installation = await this.backups.installation();
    if (!this.backups.compare(this.backups.record(op.backupId!).version, installation).compatible)
      throw new ControllerError("BACKUP_INCOMPATIBLE", "The installation changed during restore.");
    await this.lifecycle.assertStopped(op);
    await preserveCredentials(this.dataPath, staged);
    op.originalNames = (await readdir(this.dataPath)).filter((n) => !preserved(n));
    op.stagedNames = (await readdir(staged)).filter((n) => !preserved(n));
    op.replacementStarted = true;
    await this.lifecycle.phase(context, "Replacing server data");
    for (const name of op.originalNames) {
      await this.lifecycle.assertStopped(op);
      await this.move(context, join(this.dataPath, name), join(previous, name));
    }
    for (const name of op.stagedNames) {
      await this.lifecycle.assertStopped(op);
      await this.move(context, join(staged, name), join(this.dataPath, name));
    }
    await disableFtbScheduling(this.dataPath, installation.worldName);
    op.replacementComplete = true;
    await this.store.persist();
  }
  public async rollback(context: TaskContext<RestoreOperation>): Promise<void> {
    const op = context.operation;
    if (!op.replacementStarted) return;
    await this.lifecycle.identity(op);
    op.restartPolicy ??= (await this.runtime.inspect()).restartPolicy;
    op.stoppedByOperation = true;
    await this.store.persist();
    await this.runtime.setRestartPolicy({ Name: "no" });
    if ((await this.runtime.inspect()).running) await this.runtime.stop();
    await this.lifecycle.assertStopped(op);
    await this.lifecycle.phase(context, "Recovering the pre-restore data");
    const previous = join(this.workRoot, op.id, "previous");
    const staged = join(this.workRoot, op.id, "staged");
    const exists = async (path: string) => {
      try {
        await lstat(path);
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    };
    for (const name of op.stagedNames) {
      safeArchivePath(name);
      if (
        (await exists(join(previous, name))) ||
        (!op.originalNames.includes(name) && !(await exists(join(staged, name))))
      )
        await rm(join(this.dataPath, name), { recursive: true, force: true });
    }
    for (const name of op.originalNames) {
      safeArchivePath(name);
      if (await exists(join(previous, name))) {
        await rm(join(this.dataPath, name), { recursive: true, force: true });
        await this.move(context, join(previous, name), join(this.dataPath, name));
      }
    }
    await syncDirectory(this.dataPath);
    op.replacementStarted = false;
    op.replacementComplete = false;
    await this.store.persist();
  }
}
