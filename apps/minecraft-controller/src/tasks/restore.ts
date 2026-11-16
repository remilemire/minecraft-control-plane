import { randomUUID } from "node:crypto";
import { mkdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ControllerError } from "@/errors.js";
import type { TaskHandlers, TaskContext } from "@/maintenance/coordinator.js";
import type { BackupService } from "@/backups/service.js";
import type { MinecraftRuntime } from "@/runtime/contracts.js";
import { parseOnlinePlayerCount } from "@/runtime/rcon.js";
import type { ControllerStore } from "@/state/store.js";
import type { RestoreOperation } from "./operations.js";
import type { ServerTaskLifecycle } from "./server-lifecycle.js";
import type { RestoreFiles } from "./restore-files.js";
export class RestoreTask implements TaskHandlers<RestoreOperation> {
  public readonly version = 1;
  public readonly legacyVersions = [0];
  public readonly destructive = true;
  public constructor(
    private readonly dataPath: string,
    private readonly workRoot: string,
    private readonly backups: BackupService,
    private readonly runtime: MinecraftRuntime,
    private readonly store: ControllerStore,
    private readonly lifecycle: ServerTaskLifecycle,
    private readonly files: RestoreFiles,
    private readonly countdown?: () => Promise<void>,
  ) {}
  public matchesRequest(previous: RestoreOperation, incoming: RestoreOperation): boolean {
    return previous.backupId === incoming.backupId;
  }
  public async prepare(context: TaskContext<RestoreOperation>): Promise<void> {
    await this.lifecycle.capture(context);
    const op = context.operation;
    const record = this.backups.record(op.backupId!);
    let installation = await this.backups.installation();
    const check = () => {
      const compatibility = this.backups.compare(record.version, installation);
      if (
        !compatibility.compatible ||
        record.format !== "tar.gz" ||
        record.contents !== "full" ||
        record.worldName !== installation.worldName
      )
        throw new ControllerError(
          "BACKUP_INCOMPATIBLE",
          compatibility.reasons.join(" ") ||
            "The backup contents or world name do not match this server.",
        );
    };
    check();
    await this.backups.requireRestoreSpace(record.id);
    const work = join(this.workRoot, op.id);
    const staged = join(work, "staged");
    const previous = join(work, "previous");
    await mkdir(staged, { recursive: true, mode: 0o700 });
    await mkdir(previous, { mode: 0o700 });
    if ((await lstat(this.dataPath)).dev !== (await lstat(work)).dev)
      throw new ControllerError(
        "BACKUP_INVALID",
        "Recovery staging and Minecraft data must be on the same filesystem.",
      );
    await this.lifecycle.phase(context, "Validating and staging the selected backup");
    await this.backups.stage(record.id, staged);
    const stagedInstallation = await this.backups.installation(staged);
    if (!this.backups.compare(record.version, stagedInstallation).compatible)
      throw new ControllerError(
        "BACKUP_INCOMPATIBLE",
        "The archived installation does not match its version record.",
      );
    if (op.wasRunning && parseOnlinePlayerCount(await this.runtime.execute("list")) > 0) {
      await this.runtime.execute(
        "say Server recovery starts in 30 seconds. You will be disconnected while the selected backup is restored.",
      );
      await this.lifecycle.phase(context, "Server shutdown in 30 seconds");
      await (this.countdown ?? (() => delay(30_000)))();
    }
    installation = await this.backups.installation();
    check();
    await this.lifecycle.suspend(context);
    installation = await this.backups.installation();
    check();
  }
  public async safetyBackup(context: TaskContext<RestoreOperation>): Promise<void> {
    const op = context.operation;
    const installation = await this.backups.installation();
    op.safetyBackupId = randomUUID();
    await this.store.persist();
    await this.backups.capture(context, "safety", "offline", installation, op.safetyBackupId);
  }
  public safetyBackupVerified(operation: RestoreOperation): boolean {
    return this.backups.hasVerifiedSafety(operation.safetyBackupId);
  }
  public apply(context: TaskContext<RestoreOperation>): Promise<void> {
    return this.files.replace(context);
  }
  public verify(context: TaskContext<RestoreOperation>): Promise<void> {
    return this.lifecycle.resume(context);
  }
  public async recover(context: TaskContext<RestoreOperation>): Promise<void> {
    const op = context.operation;
    if (!op.containerId) return;
    if (context.interrupted || op.stoppedByOperation || op.replacementStarted) {
      // A Docker/Compose start may already be waiting in the entrypoint. Fence
      // and stop it even if replacement had not begun; retain wasRunning.
      await this.lifecycle.identity(op);
      op.restartPolicy ??= (await this.runtime.inspect()).restartPolicy;
      op.stoppedByOperation = true;
      await this.store.persist();
      await this.runtime.setRestartPolicy({ Name: "no" });
      await this.runtime.stop();
      await this.lifecycle.assertStopped(op);
    }
    await this.lifecycle.enableSaving(op);
    await this.files.rollback(context);
    await this.lifecycle.resume(context);
  }
  public async hold(context: TaskContext<RestoreOperation>): Promise<void> {
    const op = context.operation;
    if (!op.stoppedByOperation && !op.replacementStarted) return;
    try {
      await this.lifecycle.identity(op);
      op.restartPolicy ??= (await this.runtime.inspect()).restartPolicy;
      await this.store.persist();
      await this.runtime.setRestartPolicy({ Name: "no" });
      await this.runtime.stop();
    } catch (error) {
      console.error("Recovery could not confirm Minecraft is stopped", error);
      op.error = `${op.error ?? ""} Keep Minecraft stopped and inspect the recovery journal before retrying.`;
    }
  }
  public cleanup(context: TaskContext<RestoreOperation>): Promise<void> {
    return this.lifecycle.cleanup(context);
  }
}
