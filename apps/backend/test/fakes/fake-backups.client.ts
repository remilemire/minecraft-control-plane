import type { BackupsApi } from "@/features/minecraft/backups/backups.types.js";
import type {
  BackupListResponse,
  BackupRestorePreview,
  BackupSchedulesInput,
  BackupSchedulesResponse,
  MaintenanceOperation,
} from "@minecraft-control-plane/shared/minecraft";
import { AppError } from "@/errors/app-error.js";

export class FakeBackupsClient implements BackupsApi {
  public data: BackupListResponse = {
    backups: [],
    activeOperation: null,
    latestOperation: null,
    setupRequired: false,
  };
  public settings: BackupSchedulesResponse = {
    enabled: { hourly: false, daily: false, weekly: false, monthly: false },
    timezone: "America/Edmonton",
    retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
    nextRuns: { hourly: null, daily: null, weekly: null, monthly: null },
  };
  public previewData: BackupRestorePreview | undefined;
  public operations = new Map<string, MaintenanceOperation>();
  public calls: string[] = [];
  public async list() {
    return this.data;
  }
  public async schedules() {
    return this.settings;
  }
  public async updateSchedules(enabled: BackupSchedulesInput) {
    this.settings.enabled = enabled;
    return this.settings;
  }
  public async create(requestId: string) {
    this.calls.push("create");
    return requestId;
  }
  public async preview() {
    if (!this.previewData) throw new AppError("BACKUP_NOT_FOUND");
    return this.previewData;
  }
  public async restore(id: string, requestId: string) {
    this.calls.push(`restore:${id}`);
    return requestId;
  }
  public async delete(id: string) {
    this.calls.push(`delete:${id}`);
  }
  public async operation(id: string) {
    const op = this.operations.get(id);
    if (!op) throw new AppError("BACKUP_NOT_FOUND");
    return op;
  }
}
