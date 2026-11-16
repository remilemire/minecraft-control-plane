import { Router } from "express";
import type { ServerService } from "@/server/service.js";
import { createServerRoutes } from "@/server/routes.js";
import type { MaintenanceService } from "@/maintenance/service.js";
import { createMaintenanceRoutes } from "@/maintenance/routes.js";
import type { BackupService } from "@/backups/service.js";
import type { BackupScheduler } from "@/backups/scheduler.js";
import { createBackupRoutes } from "@/backups/routes.js";
export interface CreateRoutesOptions {
  readonly server: ServerService;
  readonly maintenance: MaintenanceService;
  readonly backups: BackupService;
  readonly scheduler: BackupScheduler;
}
export function createRoutes({
  server,
  maintenance,
  backups,
  scheduler,
}: CreateRoutesOptions): Router {
  const router = Router();
  router.use(createServerRoutes(server));
  router.use("/backups", createBackupRoutes(backups, scheduler));
  router.use("/maintenance", createMaintenanceRoutes(maintenance));
  // Historical clients keep their established operation/recovery URLs.
  router.use("/backups", createMaintenanceRoutes(maintenance));
  return router;
}
