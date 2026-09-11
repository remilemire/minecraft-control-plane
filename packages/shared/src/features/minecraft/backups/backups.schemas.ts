import { z } from "zod";

export const backupTierSchema = z.enum(["hourly", "daily", "weekly", "monthly"]);
export type BackupTier = z.infer<typeof backupTierSchema>;
export const backupIdSchema = z.uuid();
export const backupRequestSchema = z.strictObject({ requestId: z.uuid() });
export const backupSchedulesInputSchema = z.strictObject({
  hourly: z.boolean(),
  daily: z.boolean(),
  weekly: z.boolean(),
  monthly: z.boolean(),
});
export type BackupSchedulesInput = z.infer<typeof backupSchedulesInputSchema>;

export const serverVersionSchema = z.object({
  serverType: z.enum(["FTBA", "VANILLA", "PAPER"]),
  minecraftVersion: z.string().min(1),
  loader: z.string().nullable(),
  loaderVersion: z.string().nullable(),
  modpackId: z.string().nullable(),
  modpackVersionId: z.string().nullable(),
});
export type ServerVersion = z.infer<typeof serverVersionSchema>;

export const backupRecordSchema = z.object({
  id: backupIdSchema,
  createdAt: z.iso.datetime(),
  origin: z.enum(["manual", "scheduled", "safety", "legacy"]),
  contents: z.enum(["full", "world"]),
  format: z.enum(["tar.gz", "zip"]),
  method: z.enum(["offline", "online", "legacy"]),
  tiers: z.array(backupTierSchema),
  sizeBytes: z.number().int().nonnegative(),
  expandedBytes: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  version: serverVersionSchema.nullable(),
  worldName: z.string().min(1),
});
export type BackupRecord = z.infer<typeof backupRecordSchema>;

export const backupCompatibilitySchema = z.object({
  compatible: z.boolean(),
  reasons: z.array(z.string()),
});
export type BackupCompatibility = z.infer<typeof backupCompatibilitySchema>;
export const backupListItemSchema = backupRecordSchema.extend({
  compatibility: backupCompatibilitySchema,
});
export type BackupListItem = z.infer<typeof backupListItemSchema>;

export const maintenanceOperationSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["backup", "restore", "migration", "start", "stop", "restart"]),
  status: z.enum(["running", "succeeded", "failed", "recoveryRequired"]),
  phase: z.string(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  backupId: backupIdSchema.nullable(),
  safetyBackupId: backupIdSchema.nullable(),
  error: z.string().nullable(),
});
export type MaintenanceOperation = z.infer<typeof maintenanceOperationSchema>;
export const backupOperationAcceptedSchema = z.object({ operationId: z.uuid() });
export const backupSchedulesResponseSchema = z.object({
  enabled: backupSchedulesInputSchema,
  timezone: z.string(),
  retention: z.object({
    hourly: z.number().int().positive(),
    daily: z.number().int().positive(),
    weekly: z.number().int().positive(),
    monthly: z.number().int().positive(),
  }),
  nextRuns: z.object({
    hourly: z.iso.datetime().nullable(),
    daily: z.iso.datetime().nullable(),
    weekly: z.iso.datetime().nullable(),
    monthly: z.iso.datetime().nullable(),
  }),
});
export type BackupSchedulesResponse = z.infer<typeof backupSchedulesResponseSchema>;
export const backupListResponseSchema = z.object({
  backups: z.array(backupListItemSchema),
  activeOperation: maintenanceOperationSchema.nullable(),
  latestOperation: maintenanceOperationSchema.nullable(),
  setupRequired: z.boolean(),
});
export type BackupListResponse = z.infer<typeof backupListResponseSchema>;
export const backupRestorePreviewSchema = z.object({
  backup: backupListItemSchema,
  currentVersion: serverVersionSchema.nullable(),
  onlinePlayers: z.number().int().nonnegative().nullable(),
  running: z.boolean(),
  availableBytes: z.number().nonnegative(),
  requiredBytes: z.number().nonnegative(),
  canRestore: z.boolean(),
  reasons: z.array(z.string()),
});
export type BackupRestorePreview = z.infer<typeof backupRestorePreviewSchema>;
export const controllerRconRequestSchema = z.strictObject({
  command: z
    .string()
    .min(1)
    .max(2000)
    .refine((s) => !/[\r\n\0]/.test(s)),
});
export const controllerRconResponseSchema = z.object({ output: z.string() });
