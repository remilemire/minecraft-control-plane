import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  backupIdSchema,
  maintenanceOperationSchema,
  type BackupListResponse,
  type BackupRecord,
  type BackupRestorePreview,
  type BackupTier,
} from "@minecraft-control-plane/shared/minecraft";
import { ControllerError } from "@/errors.js";
import type { MinecraftRuntime } from "@/runtime/contracts.js";
import { parseOnlinePlayerCount } from "@/runtime/rcon.js";
import type { ControllerStore } from "@/state/store.js";
import type { MaintenanceService } from "@/maintenance/service.js";
import type { TaskContext } from "@/maintenance/coordinator.js";
import type { OperationJournal } from "@/tasks/operations.js";
import { ArchiveStorage, availableSpace, sourceSize, requireSpace } from "./archive.js";
import { compareVersions, readInstallation, type Installation } from "./versions.js";
import { applyRetention } from "./schedules.js";
export class BackupService {
  public constructor(
    public readonly storage: ArchiveStorage,
    public readonly dataPath: string,
    private readonly store: ControllerStore,
    private readonly runtime: Pick<MinecraftRuntime, "inspect" | "execute">,
    private readonly maintenance: MaintenanceService,
    private readonly retention: Record<BackupTier, number>,
    private readonly now: () => Date,
  ) {}
  public async initialize(): Promise<void> {
    await mkdir(this.storage.root, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.storage.root)) {
      if (name.startsWith(".partial-") && backupIdSchema.safeParse(name.slice(9)).success) {
        await rm(join(this.storage.root, name), { recursive: true, force: true });
        continue;
      }
      if (
        !backupIdSchema.safeParse(name).success ||
        this.store.data.backups.some((b) => b.id === name)
      )
        continue;
      if ((await this.storage.manifest(name)).backup.format !== "tar.gz") continue;
      this.store.data.backups.push((await this.storage.verify(name)).backup);
    }
    for (const op of this.store.data.operations) this.releaseFailedPools(op);
    await this.store.persist();
  }
  public installation(path = this.dataPath): Promise<Installation> {
    return this.runtime.inspect().then((current) => readInstallation(path, current.env));
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
      backups: this.store.data.backups
        .filter((b) => b.format === "tar.gz")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((b) => ({ ...b, compatibility: compareVersions(b.version, installation) })),
      activeOperation: this.maintenance.activeOperation(),
      latestOperation: this.store.data.operations.at(-1)
        ? maintenanceOperationSchema.parse(this.store.data.operations.at(-1))
        : null,
      setupRequired: false,
    };
  }
  public create(requestId: string): Promise<string> {
    return this.maintenance.submit({ kind: "backup", requestId });
  }
  public restore(backupId: string, requestId: string): Promise<string> {
    return this.maintenance.submit({ kind: "restore", requestId, backupId });
  }
  public preview(id: string): Promise<BackupRestorePreview> {
    return this.maintenance.exclusive(() => this.buildPreview(id));
  }
  private async buildPreview(id: string): Promise<BackupRestorePreview> {
    const record = this.record(id);
    const installation = await this.installation();
    const current = await this.runtime.inspect();
    const compatibility = compareVersions(record.version, installation);
    const reasons = [...compatibility.reasons];
    if (record.format !== "tar.gz") reasons.push("This archive format is no longer supported.");
    if (record.contents !== "full")
      reasons.push(
        "Legacy world-only archives cannot be restored without verifiable version metadata.",
      );
    if (record.worldName !== installation.worldName)
      reasons.push("The configured world name does not match the backup.");
    const availableBytes = await availableSpace(this.storage.root);
    const requiredBytes =
      record.expandedBytes + Math.ceil((await sourceSize(this.dataPath)) * 1.1) + 64 * 1024 * 1024;
    if (availableBytes < requiredBytes)
      reasons.push("There is not enough disk space for staging and a safety backup.");
    let onlinePlayers: number | null = 0;
    if (current.running) {
      try {
        onlinePlayers = parseOnlinePlayerCount(await this.runtime.execute("list"));
      } catch {
        onlinePlayers = null;
        reasons.push("The online player count could not be verified.");
      }
    }
    if (this.maintenance.activeOperation())
      reasons.push("Another maintenance operation is in progress.");
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
  public record(id: string): BackupRecord {
    const record = this.store.data.backups.find((r) => r.id === id);
    if (!record) throw new ControllerError("BACKUP_NOT_FOUND", "The backup no longer exists.");
    return record;
  }
  public async capture(
    context: TaskContext<OperationJournal>,
    origin: BackupRecord["origin"],
    method: BackupRecord["method"],
    installation: Installation,
    id: string,
  ): Promise<BackupRecord> {
    const op = context.operation;
    await this.phase(
      context,
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
      tiers: origin === "scheduled" ? (op.kind === "backup" ? op.tiers : []) : [],
      version: installation.version,
      worldName: installation.worldName,
    });
    this.store.data.backups.push(backup);
    await this.store.persist();
    return backup;
  }
  private async phase(context: TaskContext<OperationJournal>, name: string): Promise<void> {
    context.operation.phase = name;
    await context.checkpoint(name);
  }
  public async prune(): Promise<void> {
    const retained = applyRetention(
      this.store.data.backups,
      this.store.data.enabled,
      this.retention,
    );
    this.store.data.backups = retained;
    await this.store.persist();
    for (const backup of retained) {
      if (backup.origin !== "scheduled" || backup.tiers.length > 0) continue;
      await this.storage.remove(backup.id);
      this.store.data.backups = this.store.data.backups.filter((b) => b.id !== backup.id);
      await this.store.persist();
    }
  }
  public releaseFailedPools(op: OperationJournal): void {
    if (
      op.kind !== "backup" ||
      op.origin !== "scheduled" ||
      op.status === "succeeded" ||
      op.status === "running"
    )
      return;
    const backup = this.store.data.backups.find((record) => record.id === op.backupId);
    // A verified archive may survive a failed restart/save-on cleanup, but must
    // never displace a successful scheduled backup from a retention pool.
    if (backup) backup.tiers = [];
  }
  public delete(id: string): Promise<void> {
    return this.maintenance.exclusive(async () => {
      this.record(id);
      await this.storage.remove(id);
      this.store.data.backups = this.store.data.backups.filter((b) => b.id !== id);
      await this.store.persist();
    });
  }
  public hasVerifiedSafety(id: string | null): boolean {
    return this.store.data.backups.some((b) => b.id === id && b.origin === "safety");
  }
  public compare(version: BackupRecord["version"], installation: Installation) {
    return compareVersions(version, installation);
  }
  public async requireRestoreSpace(id: string): Promise<void> {
    await requireSpace(
      this.storage.root,
      this.record(id).expandedBytes +
        Math.ceil((await sourceSize(this.dataPath)) * 1.1) +
        64 * 1024 * 1024,
    );
  }
  public stage(id: string, destination: string): Promise<void> {
    return this.storage.verify(id, destination).then(() => {});
  }
}
