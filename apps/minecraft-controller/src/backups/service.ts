import type {
  BackupListResponse,
  BackupRestorePreview,
  BackupSchedulesInput,
  BackupSchedulesResponse,
} from "@minecraft-control-plane/shared/minecraft";
import type { Admission } from "@/maintenance/service.js";
import type { ServerOperations } from "@/server/service.js";
import type { SnapshotOperations } from "./snapshot.service.js";
import type { ScheduleService } from "./schedule.service.js";
export type { SnapshotOperations, CapturedSnapshot } from "./snapshot.service.js";
export interface BackupApi {
  list(): Promise<BackupListResponse>;
  create(requestId: string): Promise<string>;
  restore(backupId: string, requestId: string): Promise<string>;
  preview(id: string): Promise<BackupRestorePreview>;
  delete(id: string): Promise<void>;
  schedules(): BackupSchedulesResponse;
  updateSchedules(enabled: BackupSchedulesInput): Promise<BackupSchedulesResponse>;
}
export class BackupService implements BackupApi {
  public constructor(
    private readonly snapshots: SnapshotOperations,
    private readonly admission: Admission,
    private readonly server: Pick<ServerOperations, "players" | "running">,
    private readonly schedule: ScheduleService,
  ) {}
  public async list(): Promise<BackupListResponse> {
    const installation = await this.snapshots.installation().catch(() => ({
      version: null,
      worldName: "",
      pinned: false,
      reasons: ["The current installation could not be verified."],
    }));
    return {
      backups: this.snapshots
        .records()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((record) => ({
          ...record,
          compatibility: this.snapshots.compare(record.version, installation),
        })),
      activeOperation: this.admission.activeOperation(),
      latestOperation: this.admission.latestOperation(),
      setupRequired: false,
    };
  }
  public create(requestId: string): Promise<string> {
    return this.admission.submit("backup", { origin: "manual", tiers: [] }, requestId);
  }
  public restore(backupId: string, requestId: string): Promise<string> {
    return this.admission.submit("restore", { backupId }, requestId);
  }
  public delete(id: string): Promise<void> {
    return this.admission.exclusive((lease) => this.snapshots.remove(lease, id));
  }
  public schedules(): BackupSchedulesResponse {
    return this.schedule.read();
  }
  public updateSchedules(enabled: BackupSchedulesInput): Promise<BackupSchedulesResponse> {
    return this.schedule.update(enabled);
  }
  public preview(id: string): Promise<BackupRestorePreview> {
    return this.admission.exclusive(async () => {
      const backup = this.snapshots.record(id),
        installation = await this.snapshots.installation(),
        compatibility = this.snapshots.compare(backup.version, installation);
      const reasons = [...compatibility.reasons];
      if (backup.contents !== "full" || backup.worldName !== installation.worldName)
        reasons.push("The backup contents or world name do not match this server.");
      const space = await this.snapshots.space(id);
      if (space.availableBytes < space.requiredBytes)
        reasons.push("There is not enough space for staging and a safety backup.");
      // Runtime status is supplied by the server service, not inferred from RCON failure.
      const status = await this.server.running();
      let onlinePlayers: number | null = 0;
      if (status) {
        try {
          onlinePlayers = await this.server.players();
        } catch {
          onlinePlayers = null;
          reasons.push("The online player count could not be verified.");
        }
      }
      return {
        backup: { ...backup, compatibility },
        currentVersion: installation.version,
        running: status,
        onlinePlayers,
        ...space,
        canRestore: reasons.length === 0,
        reasons,
      };
    });
  }
}
