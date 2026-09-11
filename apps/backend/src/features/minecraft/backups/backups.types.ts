import type {
  BackupListResponse,
  BackupRestorePreview,
  BackupSchedulesInput,
  BackupSchedulesResponse,
  MaintenanceOperation,
} from "@minecraft-control-plane/shared/minecraft";

export interface BackupsApi {
  list(): Promise<BackupListResponse>;
  schedules(): Promise<BackupSchedulesResponse>;
  updateSchedules(input: BackupSchedulesInput): Promise<BackupSchedulesResponse>;
  create(requestId: string): Promise<string>;
  preview(id: string): Promise<BackupRestorePreview>;
  restore(id: string, requestId: string): Promise<string>;
  delete(id: string): Promise<void>;
  operation(id: string): Promise<MaintenanceOperation>;
}
