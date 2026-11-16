import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  backupIdSchema,
  backupRecordSchema,
  type BackupRecord,
  type BackupTier,
} from "@minecraft-control-plane/shared/minecraft";
import { ControllerError } from "@/errors.js";
import type { ExecutionLease } from "@/maintenance/service.js";
import type { CatalogueStore, ScheduleStore, CommitEffect } from "@/state/service.js";
import type { InstallationReader, Installation } from "@/installation/service.js";
import { ArchiveStorage, availableSpace, sourceSize, requireSpace } from "./archive.js";
import { applyRetention } from "./schedules.js";
export interface CapturedSnapshot {
  record: BackupRecord;
  change: CommitEffect;
}
export interface SnapshotOperations {
  records(): BackupRecord[];
  record(id: string): BackupRecord;
  installation(path?: string): Promise<Installation>;
  compare: InstallationReader["compare"];
  capture(
    lease: ExecutionLease,
    metadata: {
      id: string;
      createdAt: string;
      origin: "manual" | "scheduled" | "safety";
      method: "online" | "offline";
      tiers: BackupTier[];
      installation: Installation;
    },
  ): Promise<CapturedSnapshot>;
  stage(lease: ExecutionLease, id: string, destination: string): Promise<void>;
  space(id: string): Promise<{ availableBytes: number; requiredBytes: number }>;
  requireSpace(id: string): Promise<void>;
  verifyOriginal(lease: ExecutionLease, id: string): Promise<void>;
  remove(lease: ExecutionLease, id: string): Promise<void>;
  prune(lease: ExecutionLease): Promise<void>;
  releaseFailedSchedule(lease: ExecutionLease, id: string | null): Promise<void>;
  reconcile(): Promise<void>;
}
/** Native storage and catalogue operations; available only to admitted services/tasks. */
export class SnapshotService implements SnapshotOperations {
  private readonly archives: ArchiveStorage;
  public constructor(
    private readonly root: string,
    private readonly data: string,
    private readonly catalogue: CatalogueStore,
    private readonly schedules: Pick<ScheduleStore, "read">,
    private readonly versions: InstallationReader,
    private readonly retention: Record<BackupTier, number>,
  ) {
    this.archives = new ArchiveStorage(root);
  }
  public records(): BackupRecord[] {
    const deleting = this.catalogue.pendingDeletes();
    return this.catalogue
      .list()
      .filter((record) => record.format === "tar.gz" && !deleting.includes(record.id))
      .map((record) => backupRecordSchema.parse(record));
  }
  public record(id: string): BackupRecord {
    const record = this.records().find((record) => record.id === id);
    if (!record) throw new ControllerError("BACKUP_NOT_FOUND", "The backup no longer exists.");
    return record;
  }
  public installation(path = this.data): Promise<Installation> {
    return this.versions.read(path);
  }
  public compare: InstallationReader["compare"] = (backup, current) =>
    this.versions.compare(backup, current);
  public async capture(
    lease: ExecutionLease,
    metadata: Parameters<SnapshotOperations["capture"]>[1],
  ): Promise<CapturedSnapshot> {
    lease.assertActive();
    const record = await this.archives.create(this.data, {
      id: metadata.id,
      createdAt: metadata.createdAt,
      origin: metadata.origin,
      method: metadata.method,
      contents: "full",
      tiers: metadata.tiers,
      version: metadata.installation.version,
      worldName: metadata.installation.worldName,
    });
    lease.assertActive();
    return { record, change: this.catalogue.put(record) };
  }
  public async stage(lease: ExecutionLease, id: string, destination: string): Promise<void> {
    lease.assertActive();
    this.record(id);
    await this.archives.verify(id, destination);
  }
  public async space(id: string) {
    return {
      availableBytes: await availableSpace(this.root),
      requiredBytes:
        this.record(id).expandedBytes +
        Math.ceil((await sourceSize(this.data)) * 1.1) +
        64 * 1024 * 1024,
    };
  }
  public async requireSpace(id: string): Promise<void> {
    const space = await this.space(id);
    await requireSpace(this.root, space.requiredBytes);
  }
  public async verifyOriginal(lease: ExecutionLease, id: string): Promise<void> {
    lease.assertActive();
    await this.archives.verifySource(id, this.data);
  }
  private async deleteFiles(id: string): Promise<void> {
    await this.archives.remove(id);
    await this.catalogue.commit([this.catalogue.finishDelete(id)]);
  }
  public async remove(lease: ExecutionLease, id: string): Promise<void> {
    lease.assertActive();
    this.record(id);
    await this.catalogue.commit([this.catalogue.beginDelete(id)]);
    try {
      await this.deleteFiles(id);
    } catch (cause) {
      throw new ControllerError(
        "BACKUP_RECOVERY_REQUIRED",
        "Archive deletion needs cleanup. Inspect storage and retry maintenance recovery.",
        { cause },
      );
    }
  }
  public async reconcile(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const id of this.catalogue.pendingDeletes()) await this.deleteFiles(id);
    for (const name of await readdir(this.root)) {
      if (name.startsWith(".partial-") && backupIdSchema.safeParse(name.slice(9)).success) {
        await rm(join(this.root, name), { recursive: true, force: true });
        continue;
      }
      if (
        !backupIdSchema.safeParse(name).success ||
        this.catalogue.list().some((record) => record.id === name)
      )
        continue;
      if ((await this.archives.manifest(name)).backup.format !== "tar.gz") continue;
      await this.catalogue.commit([this.catalogue.put((await this.archives.verify(name)).backup)]);
    }
  }
  public async releaseFailedSchedule(lease: ExecutionLease, id: string | null): Promise<void> {
    lease.assertActive();
    const record = this.records().find(
      (record) => record.id === id && record.origin === "scheduled",
    );
    if (record)
      await this.catalogue.commit([this.catalogue.memberships([{ id: record.id, tiers: [] }])]);
  }
  public async prune(lease: ExecutionLease): Promise<void> {
    lease.assertActive();
    const retained = applyRetention(
      this.records(),
      structuredClone(this.schedules.read().enabled),
      this.retention,
    );
    await this.catalogue.commit([this.catalogue.memberships(retained)]);
    for (const record of retained)
      if (record.origin === "scheduled" && record.tiers.length === 0)
        await this.remove(lease, record.id);
  }
}
