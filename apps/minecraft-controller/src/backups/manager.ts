import {
  backupIdSchema,
  maintenanceOperationSchema,
  type BackupListResponse,
  type BackupRecord,
  type BackupRestorePreview,
  type BackupSchedulesInput,
  type BackupSchedulesResponse,
  type BackupTier,
  type MaintenanceOperation,
} from "@minecraft-control-plane/shared/minecraft";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  ArchiveStorage,
  availableSpace,
  preserved,
  requireSpace,
  safeArchivePath,
  sourceSize,
} from "./archive.js";
import { BackupError, isMissing, publicFailure } from "./errors.js";
import { disableFtbScheduling, ftbConfigExists, importLegacy } from "./migration.js";
import { playerCount, type BackupRuntime } from "./runtime.js";
import { applyRetention, nextOccurrence, TIERS } from "./schedules.js";
import {
  BackupStore,
  journalSchema,
  syncDirectory,
  type BackupState,
  type OperationJournal,
} from "./store.js";
import { compareVersions, readInstallation, type Installation } from "./versions.js";
import { preserveCredentials } from "./credentials.js";
import {
  MaintenanceCoordinator,
  type MaintenanceTask,
  type TaskContext,
} from "@/maintenance/coordinator.js";
import type { StartupAuthorization } from "@/maintenance/startup-gate.js";
import { atomicText } from "@/maintenance/atomic-files.js";

export interface BackupManagerOptions {
  dataRoot: string;
  timezone: string;
  retention: Record<BackupTier, number>;
  runtime: BackupRuntime;
  now?: () => Date;
  countdown?: () => Promise<void>;
  startupGate?: StartupAuthorization | undefined;
  observer?: (operation: OperationJournal, event: string) => Promise<void>;
}

export class BackupManager {
  public readonly storage: ArchiveStorage;
  public readonly dataPath: string;
  private readonly workRoot: string;
  private readonly store: BackupStore;
  private state!: BackupState;
  private readonly coordinator: MaintenanceCoordinator<OperationJournal>;
  private timer: NodeJS.Timeout | undefined;
  private readonly now: () => Date;

  public constructor(private readonly options: BackupManagerOptions) {
    this.dataPath = join(options.dataRoot, "minecraft");
    this.storage = new ArchiveStorage(join(options.dataRoot, "backups"), async (event) => {
      const operation = this.coordinator.active();
      if (operation) await options.observer?.(operation, event);
    });
    this.workRoot = join(options.dataRoot, "backup-recovery");
    this.store = new BackupStore(join(options.dataRoot, "backup-state"));
    this.now = options.now ?? (() => new Date());
    this.coordinator = new MaintenanceCoordinator({
      operations: () => this.state.operations,
      persist: () => this.save(),
      tasks: this.tasks(),
      gate: options.startupGate,
      available: async () => {
        await options.runtime.inspect();
      },
      describe: publicFailure,
      now: this.now,
      observer: options.observer,
    });
  }

  public async initialize(): Promise<void> {
    this.state = await this.store.load(this.options.timezone);
    await mkdir(this.storage.root, { recursive: true, mode: 0o700 });
    await mkdir(this.workRoot, { recursive: true, mode: 0o700 });
    if (this.state.timezone !== this.options.timezone) {
      this.state.timezone = this.options.timezone;
      for (const tier of TIERS)
        this.state.nextRuns[tier] = this.state.enabled[tier]
          ? nextOccurrence(tier, this.now(), this.options.timezone)
          : null;
    }
    // Restore saving and safe server data before potentially slow archive verification.
    await this.coordinator.recoverInterrupted();
    // A committed archive can precede its catalogue write if the controller dies.
    for (const name of await readdir(this.storage.root)) {
      if (name.startsWith(".partial-") && backupIdSchema.safeParse(name.slice(9)).success) {
        await rm(join(this.storage.root, name), { recursive: true, force: true });
        continue;
      }
      if (!backupIdSchema.safeParse(name).success || this.state.backups.some((b) => b.id === name))
        continue;
      const manifest = await this.storage.verify(name);
      this.state.backups.push(manifest.backup);
    }
    for (const operation of this.state.operations) this.releaseFailedPools(operation);
    await this.save();
    await atomicText(join(this.store.root, "initialized"), "1\n");
    await this.coordinator.ready();
  }

  public startScheduler(): void {
    const tick = async () => {
      try {
        await this.coordinator.retry();
        await this.tick();
      } catch (error) {
        console.error("Backup scheduler", error);
      }
      if (!this.coordinator.closing)
        this.timer = setTimeout(() => {
          void tick();
        }, 1000);
    };
    this.timer = setTimeout(() => {
      void tick();
    }, 1000);
  }
  public async close(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.coordinator.close();
  }
  public activeOperation(): MaintenanceOperation | null {
    const operation = this.coordinator.active();
    return operation ? this.publicOperation(operation) : null;
  }
  public operation(id: string): MaintenanceOperation {
    const operation = this.coordinator.operation(id);
    if (!operation)
      throw new BackupError("BACKUP_NOT_FOUND", "The requested operation was not found.");
    return this.publicOperation(operation);
  }
  private publicOperation(operation: OperationJournal): MaintenanceOperation {
    const status = this.coordinator.status(operation);
    const cleanupBlocked = status === "recoveryRequired" && operation.status !== "recoveryRequired";
    return maintenanceOperationSchema.parse({
      ...operation,
      status,
      phase: cleanupBlocked ? "Cleanup needs attention" : operation.phase,
      error: cleanupBlocked
        ? "The result is committed, but cleanup needs attention. Inspect storage and run make backup-recover."
        : operation.error,
      finishedAt:
        status === "running" || status === "recoveryRequired" ? null : operation.finishedAt,
    });
  }
  private async save(): Promise<void> {
    try {
      await this.store.save(this.state);
    } catch (error) {
      throw new BackupError(
        "BACKUP_RECOVERY_REQUIRED",
        "The maintenance journal could not be persisted. Startup remains blocked.",
        { cause: error },
      );
    }
  }
  public async setupRequired(): Promise<boolean> {
    return !this.state.migrated && (await ftbConfigExists(this.dataPath));
  }
  private async installation(): Promise<Installation> {
    return readInstallation(this.dataPath, (await this.options.runtime.inspect()).env);
  }
  public async list(): Promise<BackupListResponse> {
    let installation: Installation;
    try {
      installation = await this.installation();
    } catch {
      installation = {
        version: null,
        worldName: "",
        pinned: false,
        reasons: ["The Minecraft controller could not verify the current installation."],
      };
    }
    return {
      backups: [...this.state.backups]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((b) => ({ ...b, compatibility: compareVersions(b.version, installation) })),
      activeOperation: this.activeOperation(),
      latestOperation: this.state.operations.at(-1)
        ? maintenanceOperationSchema.parse(this.state.operations.at(-1))
        : null,
      setupRequired: await this.setupRequired(),
    };
  }
  public schedules(): BackupSchedulesResponse {
    return {
      enabled: { ...this.state.enabled },
      timezone: this.options.timezone,
      retention: { ...this.options.retention },
      nextRuns: { ...this.state.nextRuns },
    };
  }
  public async updateSchedules(enabled: BackupSchedulesInput): Promise<BackupSchedulesResponse> {
    return this.coordinator.exclusive(async () => {
      if (Object.values(enabled).some(Boolean) && (await this.setupRequired()))
        throw new BackupError(
          "BACKUP_SETUP_REQUIRED",
          "Run make backup-migrate with Minecraft stopped before enabling panel backups.",
        );
      for (const tier of TIERS) {
        if (enabled[tier] !== this.state.enabled[tier])
          this.state.nextRuns[tier] = enabled[tier]
            ? nextOccurrence(tier, this.now(), this.options.timezone)
            : null;
      }
      this.state.enabled = { ...enabled };
      await this.save();
      return this.schedules();
    });
  }
  public async tick(): Promise<void> {
    if (!this.coordinator.initialized || this.coordinator.closing || this.activeOperation()) return;
    const now = this.now();
    const due = TIERS.filter(
      (t) =>
        this.state.enabled[t] &&
        this.state.nextRuns[t] !== null &&
        new Date(this.state.nextRuns[t]!).getTime() <= now.getTime(),
    );
    if (!due.length) return;
    await this.submit("backup", randomUUID(), null, "scheduled", due);
  }
  public execute(command: string): Promise<string> {
    return this.coordinator.exclusive(() => this.options.runtime.execute(command));
  }
  public async create(requestId: string): Promise<string> {
    return this.submit("backup", requestId, null);
  }
  public async restore(id: string, requestId: string): Promise<string> {
    return this.submit("restore", requestId, id);
  }
  public async migrate(requestId: string): Promise<string> {
    return this.submit("migration", requestId, null);
  }
  public async power(kind: "start" | "stop" | "restart"): Promise<void> {
    const id = await this.submit(kind, randomUUID(), null);
    await this.coordinator.wait();
    const operation = this.operation(id);
    if (operation.status !== "succeeded")
      throw new BackupError(
        operation.status === "recoveryRequired"
          ? "BACKUP_RECOVERY_REQUIRED"
          : "BACKUP_CONTROLLER_ERROR",
        operation.error ?? "The power operation failed.",
      );
  }
  private async submit(
    kind: OperationJournal["kind"],
    requestId: string,
    backupId: string | null,
    origin: "manual" | "scheduled" = "manual",
    tiers: BackupTier[] = [],
  ): Promise<string> {
    const op = journalSchema.parse({
      id: requestId,
      taskVersion: 1,
      kind,
      status: "running",
      phase: "Preparing",
      startedAt: this.now().toISOString(),
      finishedAt: null,
      backupId,
      safetyBackupId: null,
      error: null,
      origin,
      tiers,
    });
    return this.coordinator.submit(op, () => {
      for (const tier of tiers)
        this.state.nextRuns[tier] = nextOccurrence(tier, this.now(), this.options.timezone);
    });
  }
  private async phase(op: OperationJournal, phase: string): Promise<void> {
    op.phase = phase;
    await this.coordinator.checkpoint(op, phase);
  }
  private async identity(op: OperationJournal): Promise<void> {
    const current = await this.options.runtime.inspect();
    if (op.containerId !== current.containerId)
      throw new BackupError(
        "BACKUP_RECOVERY_REQUIRED",
        "The Minecraft container changed during maintenance. Keep it stopped and inspect recovery before proceeding.",
      );
  }
  private async assertStopped(op: OperationJournal): Promise<void> {
    await this.identity(op);
    if ((await this.options.runtime.inspect()).running)
      throw new BackupError(
        "BACKUP_RECOVERY_REQUIRED",
        "Minecraft started outside the panel during maintenance. Stop it before recovering.",
      );
  }
  private async suspend(op: OperationJournal): Promise<void> {
    const current = await this.options.runtime.inspect();
    await this.identity(op);
    op.restartPolicy ??= current.restartPolicy;
    op.stoppedByOperation = true;
    await this.save();
    await this.options.runtime.setRestartPolicy({ Name: "no" });
    await this.phase(op, "Stopping Minecraft gracefully");
    try {
      await this.options.runtime.stop();
    } catch (error) {
      throw new BackupError(
        "BACKUP_RECOVERY_REQUIRED",
        `${publicFailure(error)} The stop outcome must be checked before recovery continues.`,
        { cause: error },
      );
    }
    await this.assertStopped(op);
  }
  private async resume(op: OperationJournal): Promise<void> {
    await this.identity(op);
    if (op.wasRunning && op.stoppedByOperation) {
      await this.phase(op, "Starting Minecraft and checking readiness");
      await this.coordinator.boot(op, op.containerId!, async () => {
        if (!(await this.options.runtime.inspect()).running) await this.options.runtime.start();
        await this.options.observer?.(op, "verification-boot");
        await this.options.runtime.waitReady();
      });
    }
    if (op.restartPolicy) {
      await this.options.runtime.setRestartPolicy(op.restartPolicy);
      op.restartPolicy = null;
    }
    op.stoppedByOperation = false;
    await this.save();
  }
  private async enableSaving(op: OperationJournal): Promise<void> {
    if (!op.savingDisabled) return;
    await this.identity(op);
    if ((await this.options.runtime.inspect()).running) {
      const output = await this.options.runtime.execute("save-on");
      if (!/already turned on|enabled|turned on/i.test(output))
        throw new BackupError(
          "BACKUP_RECOVERY_REQUIRED",
          "Minecraft saving could not be re-enabled. Check RCON and run make backup-recover.",
        );
    }
    op.savingDisabled = false;
    await this.save();
  }
  private async createArchive(
    op: OperationJournal,
    origin: BackupRecord["origin"],
    method: BackupRecord["method"],
    installation: Installation,
    id: string,
  ): Promise<BackupRecord> {
    await this.phase(
      op,
      origin === "safety"
        ? "Creating and verifying the safety backup"
        : "Creating and verifying the backup",
    );
    const backup = await this.storage.create(this.dataPath, {
      id,
      createdAt: this.now().toISOString(),
      origin,
      contents: "full",
      method,
      tiers: origin === "scheduled" ? op.tiers : [],
      version: installation.version,
      worldName: installation.worldName,
    });
    this.state.backups.push(backup);
    await this.save();
    return backup;
  }
  private async backup(op: OperationJournal): Promise<void> {
    if (await this.setupRequired())
      throw new BackupError(
        "BACKUP_SETUP_REQUIRED",
        "Run make backup-migrate with Minecraft stopped before creating panel backups.",
      );
    const installation = await this.installation();
    if (!installation.version)
      throw new BackupError("BACKUP_INCOMPATIBLE", installation.reasons.join(" "));
    let method: "online" | "offline" = "offline";
    if (op.wasRunning) {
      const count = playerCount(await this.options.runtime.execute("list"));
      if (count === 0) await this.suspend(op);
      else {
        method = "online";
        op.savingDisabled = true;
        await this.save();
        const output = await this.options.runtime.execute("save-off");
        if (!/disabled|turned off|already turned off/i.test(output))
          throw new BackupError(
            "BACKUP_CONTROLLER_ERROR",
            "Minecraft did not confirm that saving was suspended.",
          );
        const saved = await this.options.runtime.execute("save-all flush", 120);
        if (!/saved the game|saved the world/i.test(saved))
          throw new BackupError(
            "BACKUP_CONTROLLER_ERROR",
            "Minecraft did not confirm that the world was flushed to disk.",
          );
      }
    }
    op.backupId = randomUUID();
    await this.save();
    await this.createArchive(op, op.origin, method, installation, op.backupId);
    await this.enableSaving(op);
    await this.resume(op);
  }
  public preview(id: string): Promise<BackupRestorePreview> {
    return this.coordinator.exclusive(() => this.buildPreview(id));
  }
  private async buildPreview(id: string): Promise<BackupRestorePreview> {
    const record = this.record(id);
    const installation = await this.installation();
    const current = await this.options.runtime.inspect();
    const compatibility = compareVersions(record.version, installation);
    const reasons = [...compatibility.reasons];
    if (record.contents !== "full")
      reasons.push(
        "Legacy world-only archives cannot be restored without verifiable version metadata.",
      );
    if (record.worldName !== installation.worldName)
      reasons.push("The configured world name does not match the backup.");
    if (await this.setupRequired())
      reasons.push("Migrate FTB backups before using panel recovery.");
    const availableBytes = await availableSpace(this.storage.root);
    const requiredBytes =
      record.expandedBytes + Math.ceil((await sourceSize(this.dataPath)) * 1.1) + 64 * 1024 * 1024;
    if (availableBytes < requiredBytes)
      reasons.push("There is not enough disk space for staging and a safety backup.");
    let onlinePlayers: number | null = 0;
    if (current.running) {
      try {
        onlinePlayers = playerCount(await this.options.runtime.execute("list"));
      } catch {
        onlinePlayers = null;
        reasons.push("The online player count could not be verified.");
      }
    }
    if (this.activeOperation()) reasons.push("Another maintenance operation is in progress.");
    return {
      backup: { ...record, compatibility },
      currentVersion: installation.version,
      running: current.running,
      onlinePlayers,
      availableBytes,
      requiredBytes,
      canRestore: reasons.length === 0,
      reasons,
    };
  }
  private record(id: string): BackupRecord {
    const record = this.state.backups.find((r) => r.id === id);
    if (!record) throw new BackupError("BACKUP_NOT_FOUND", "The backup no longer exists.");
    return record;
  }
  private async prepareRestore(op: OperationJournal): Promise<void> {
    const record = this.record(op.backupId!);
    let installation = await this.installation();
    const check = () => {
      const compatibility = compareVersions(record.version, installation);
      if (
        !compatibility.compatible ||
        record.contents !== "full" ||
        record.worldName !== installation.worldName
      )
        throw new BackupError(
          "BACKUP_INCOMPATIBLE",
          compatibility.reasons.join(" ") ||
            "The backup contents or world name do not match this server.",
        );
    };
    check();
    if (await this.setupRequired())
      throw new BackupError(
        "BACKUP_SETUP_REQUIRED",
        "Migrate FTB backups before using panel recovery.",
      );
    await requireSpace(
      this.storage.root,
      record.expandedBytes + Math.ceil((await sourceSize(this.dataPath)) * 1.1) + 64 * 1024 * 1024,
    );
    const work = join(this.workRoot, op.id);
    const staged = join(work, "staged");
    const previous = join(work, "previous");
    await mkdir(staged, { recursive: true, mode: 0o700 });
    await mkdir(previous, { mode: 0o700 });
    if ((await lstat(this.dataPath)).dev !== (await lstat(work)).dev)
      throw new BackupError(
        "BACKUP_INVALID",
        "Recovery staging and Minecraft data must be on the same filesystem.",
      );
    await this.phase(op, "Validating and staging the selected backup");
    await this.storage.verify(record.id, staged);
    const stagedInstallation = await readInstallation(
      staged,
      (await this.options.runtime.inspect()).env,
    );
    if (!compareVersions(record.version, stagedInstallation).compatible)
      throw new BackupError(
        "BACKUP_INCOMPATIBLE",
        "The archived installation does not match its version record.",
      );
    if (op.wasRunning && playerCount(await this.options.runtime.execute("list")) > 0) {
      await this.options.runtime.execute(
        "say Server recovery starts in 30 seconds. You will be disconnected while the selected backup is restored.",
      );
      await this.phase(op, "Server shutdown in 30 seconds");
      await (this.options.countdown ?? (() => delay(30_000)))();
    }
    installation = await this.installation();
    check();
    await this.suspend(op);
    installation = await this.installation();
    check();
  }
  private async safetyBackup(op: OperationJournal): Promise<void> {
    const installation = await this.installation();
    op.safetyBackupId = randomUUID();
    await this.save();
    await this.createArchive(op, "safety", "offline", installation, op.safetyBackupId);
  }
  private async applyRestore(op: OperationJournal): Promise<void> {
    const work = join(this.workRoot, op.id);
    const staged = join(work, "staged");
    const previous = join(work, "previous");
    const installation = await this.installation();
    if (!compareVersions(this.record(op.backupId!).version, installation).compatible)
      throw new BackupError("BACKUP_INCOMPATIBLE", "The installation changed during restore.");
    await this.assertStopped(op);
    await preserveCredentials(this.dataPath, staged);
    op.originalNames = (await readdir(this.dataPath)).filter((n) => !preserved(n));
    op.stagedNames = (await readdir(staged)).filter((n) => !preserved(n));
    op.replacementStarted = true;
    await this.phase(op, "Replacing server data");
    for (const name of op.originalNames) {
      await this.assertStopped(op);
      await this.move(join(this.dataPath, name), join(previous, name));
    }
    for (const name of op.stagedNames) {
      await this.assertStopped(op);
      await this.move(join(staged, name), join(this.dataPath, name));
    }
    await disableFtbScheduling(this.dataPath, installation.worldName);
    op.replacementComplete = true;
    await this.save();
  }
  private async move(from: string, to: string): Promise<void> {
    await rename(from, to);
    await syncDirectory(join(from, ".."));
    await syncDirectory(join(to, ".."));
    const operation = this.coordinator.active();
    if (operation) await this.coordinator.checkpoint(operation, `moved:${from.split("/").at(-1)}`);
  }
  private async rollback(op: OperationJournal): Promise<void> {
    if (!op.replacementStarted) return;
    await this.identity(op);
    op.restartPolicy ??= (await this.options.runtime.inspect()).restartPolicy;
    op.stoppedByOperation = true;
    await this.save();
    await this.options.runtime.setRestartPolicy({ Name: "no" });
    if ((await this.options.runtime.inspect()).running) await this.options.runtime.stop();
    await this.assertStopped(op);
    await this.phase(op, "Recovering the pre-restore data");
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
        await this.move(join(previous, name), join(this.dataPath, name));
      }
    }
    await syncDirectory(this.dataPath);
    op.replacementStarted = false;
    op.replacementComplete = false;
    await this.save();
  }
  private async prune(): Promise<void> {
    const retained = applyRetention(this.state.backups, this.state.enabled, this.options.retention);
    this.state.backups = retained;
    await this.save();
    for (const backup of retained) {
      if (backup.origin !== "scheduled" || backup.tiers.length > 0) continue;
      await this.storage.remove(backup.id);
      this.state.backups = this.state.backups.filter((b) => b.id !== backup.id);
      await this.save();
    }
  }
  private releaseFailedPools(op: OperationJournal): void {
    if (
      op.kind !== "backup" ||
      op.origin !== "scheduled" ||
      op.status === "succeeded" ||
      op.status === "running"
    )
      return;
    const backup = this.state.backups.find((record) => record.id === op.backupId);
    // A verified archive may survive a failed restart/save-on cleanup, but must
    // never displace a successful scheduled backup from a retention pool.
    if (backup) backup.tiers = [];
  }
  private async holdStopped(op: OperationJournal): Promise<void> {
    if (op.kind !== "restore" || (!op.stoppedByOperation && !op.replacementStarted)) return;
    try {
      await this.identity(op);
      op.restartPolicy ??= (await this.options.runtime.inspect()).restartPolicy;
      await this.save();
      await this.options.runtime.setRestartPolicy({ Name: "no" });
      await this.options.runtime.stop();
    } catch (error) {
      console.error("Recovery could not confirm Minecraft is stopped", error);
      op.error = `${op.error ?? ""} Keep Minecraft stopped and inspect the recovery journal before retrying.`;
    }
  }
  public delete(id: string): Promise<void> {
    return this.coordinator.exclusive(async () => {
      this.record(id);
      await this.storage.remove(id);
      this.state.backups = this.state.backups.filter((b) => b.id !== id);
      await this.save();
    });
  }
  private async recoverTask(op: OperationJournal, interrupted: boolean): Promise<void> {
    if (!op.containerId) return;
    if (op.kind === "restore" && (interrupted || op.stoppedByOperation || op.replacementStarted)) {
      // A Docker/Compose start may already be waiting in the entrypoint. Fence
      // and stop it even if replacement had not begun; retain wasRunning.
      await this.identity(op);
      op.restartPolicy ??= (await this.options.runtime.inspect()).restartPolicy;
      op.stoppedByOperation = true;
      await this.save();
      await this.options.runtime.setRestartPolicy({ Name: "no" });
      await this.options.runtime.stop();
      await this.assertStopped(op);
    }
    await this.enableSaving(op);
    await this.rollback(op);
    await this.resume(op);
  }
  private tasks(): ReadonlyMap<string, MaintenanceTask<OperationJournal>> {
    const recover = ({ operation, interrupted }: TaskContext<OperationJournal>) =>
      this.recoverTask(operation, interrupted);
    const hold = ({ operation }: { operation: OperationJournal }) => this.holdStopped(operation);
    const cleanup = async ({ operation }: { operation: OperationJournal }) => {
      this.releaseFailedPools(operation);
      if (operation.kind === "backup" && operation.status === "succeeded") await this.prune();
      await rm(join(this.workRoot, operation.id), { recursive: true, force: true });
      await syncDirectory(this.workRoot);
    };
    const task = (
      apply: (op: OperationJournal) => Promise<void>,
    ): MaintenanceTask<OperationJournal> => ({
      version: 1,
      legacyVersions: [0],
      apply: ({ operation }) => apply(operation),
      recover,
      hold,
      cleanup,
      prepare: async ({ operation }) => {
        const current = await this.options.runtime.inspect();
        operation.containerId = current.containerId;
        operation.wasRunning = current.running;
        await this.save();
      },
    });
    const restore = task((op) => this.applyRestore(op));
    const capture = restore.prepare!;
    restore.prepare = async (context) => {
      await capture(context);
      await this.prepareRestore(context.operation);
    };
    restore.destructive = true;
    restore.matchesRequest = (previous, incoming) => previous.backupId === incoming.backupId;
    restore.safetyBackup = ({ operation }) => this.safetyBackup(operation);
    restore.safetyBackupVerified = (operation) =>
      this.state.backups.some((b) => b.id === operation.safetyBackupId && b.origin === "safety");
    restore.verify = ({ operation }) => this.resume(operation);
    return new Map([
      ["backup", task((op) => this.backup(op))],
      ["restore", restore],
      [
        "migration",
        task(async (op) => {
          if ((await this.options.runtime.inspect()).running)
            throw new BackupError(
              "BACKUP_SETUP_REQUIRED",
              "Stop Minecraft through the panel before migration.",
            );
          const installation = await this.installation();
          if (!installation.version)
            throw new BackupError("BACKUP_INCOMPATIBLE", installation.reasons.join(" "));
          await this.phase(op, "Importing existing FTB backups");
          await importLegacy(this.dataPath, this.storage, this.state, () => this.save());
          await disableFtbScheduling(this.dataPath, installation.worldName);
          this.state.migrated = true;
          await this.save();
        }),
      ],
      [
        "start",
        task(async (op) => {
          await this.phase(op, "Starting Minecraft and checking readiness");
          await this.coordinator.boot(op, op.containerId!, async () => {
            await this.options.runtime.start();
            await this.options.runtime.waitReady();
          });
        }),
      ],
      [
        "stop",
        task(async () => {
          await this.options.runtime.stop();
        }),
      ],
      [
        "restart",
        task(async (op) => {
          await this.suspend(op);
          op.wasRunning = true;
          await this.resume(op);
        }),
      ],
    ]);
  }
  public async recover(): Promise<void> {
    const operation = this.coordinator.active();
    if (!operation) return;
    await this.coordinator.recover(operation);
    if (this.coordinator.active())
      throw new BackupError(
        "BACKUP_RECOVERY_REQUIRED",
        operation.error ?? "Recovery needs attention.",
      );
  }
}
