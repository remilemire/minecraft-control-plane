import { randomUUID } from "node:crypto";
import { ControllerError } from "@/errors.js";
import type { TaskHandlers, TaskContext } from "@/maintenance/coordinator.js";
import type { BackupService } from "@/backups/service.js";
import type { MinecraftRuntime } from "@/runtime/contracts.js";
import { parseOnlinePlayerCount } from "@/runtime/rcon.js";
import type { ControllerStore } from "@/state/store.js";
import type { BackupOperation } from "./operations.js";
import type { ServerTaskLifecycle } from "./server-lifecycle.js";
export class BackupTask implements TaskHandlers<BackupOperation> {
  public readonly version = 1;
  public readonly legacyVersions = [0];
  public constructor(
    private readonly backups: BackupService,
    private readonly runtime: MinecraftRuntime,
    private readonly store: ControllerStore,
    private readonly lifecycle: ServerTaskLifecycle,
  ) {}
  public prepare(context: TaskContext<BackupOperation>): Promise<void> {
    return this.lifecycle.capture(context);
  }
  public async apply(context: TaskContext<BackupOperation>): Promise<void> {
    const op = context.operation;
    const installation = await this.backups.installation();
    if (!installation.version)
      throw new ControllerError("BACKUP_INCOMPATIBLE", installation.reasons.join(" "));
    let method: "online" | "offline" = "offline";
    if (op.wasRunning) {
      const count = parseOnlinePlayerCount(await this.runtime.execute("list"));
      if (count === 0) await this.lifecycle.suspend(context);
      else {
        method = "online";
        op.savingDisabled = true;
        await this.store.persist();
        const output = await this.runtime.execute("save-off");
        if (!/disabled|turned off|already turned off/i.test(output))
          throw new ControllerError(
            "BACKUP_CONTROLLER_ERROR",
            "Minecraft did not confirm that saving was suspended.",
          );
        const saved = await this.runtime.execute("save-all flush", 120);
        if (!/saved the game|saved the world/i.test(saved))
          throw new ControllerError(
            "BACKUP_CONTROLLER_ERROR",
            "Minecraft did not confirm that the world was flushed to disk.",
          );
      }
    }
    op.backupId = randomUUID();
    await this.store.persist();
    await this.backups.capture(context, op.origin, method, installation, op.backupId);
    await this.lifecycle.enableSaving(op);
    await this.lifecycle.resume(context);
  }
  public async recover(context: TaskContext<BackupOperation>): Promise<void> {
    if (!context.operation.containerId) return;
    await this.lifecycle.enableSaving(context.operation);
    await this.lifecycle.resume(context);
  }
  public async hold(): Promise<void> {}
  public async cleanup(context: TaskContext<BackupOperation>): Promise<void> {
    this.backups.releaseFailedPools(context.operation);
    if (context.operation.status === "succeeded") await this.backups.prune();
    await this.lifecycle.cleanup(context);
  }
}
