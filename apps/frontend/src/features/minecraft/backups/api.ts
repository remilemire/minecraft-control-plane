import { apiRequest } from "@/lib/apiClient";
import {
  backupListResponseSchema,
  backupOperationAcceptedSchema,
  backupRequestSchema,
  backupRestorePreviewSchema,
  backupSchedulesInputSchema,
  backupSchedulesResponseSchema,
  type BackupSchedulesInput,
} from "@minecraft-control-plane/shared/minecraft";

const BASE = "/minecraft/backups";
export function fetchBackups() {
  return apiRequest("GET", BASE, { schema: backupListResponseSchema });
}
export function fetchBackupSchedules() {
  return apiRequest("GET", `${BASE}/schedules`, { schema: backupSchedulesResponseSchema });
}
export function updateBackupSchedules(enabled: BackupSchedulesInput) {
  return apiRequest("PUT", `${BASE}/schedules`, {
    schema: backupSchedulesResponseSchema,
    body: backupSchedulesInputSchema.parse(enabled),
  });
}
export function createBackup(requestId: string) {
  return apiRequest("POST", BASE, {
    schema: backupOperationAcceptedSchema,
    body: backupRequestSchema.parse({ requestId }),
  });
}
export function previewRestore(id: string) {
  return apiRequest("GET", `${BASE}/${encodeURIComponent(id)}/restore-preview`, {
    schema: backupRestorePreviewSchema,
  });
}
export function restoreBackup(id: string, requestId: string) {
  return apiRequest("POST", `${BASE}/${encodeURIComponent(id)}/restore`, {
    schema: backupOperationAcceptedSchema,
    body: backupRequestSchema.parse({ requestId }),
  });
}
export function deleteBackup(id: string) {
  return apiRequest("DELETE", `${BASE}/${encodeURIComponent(id)}`);
}
