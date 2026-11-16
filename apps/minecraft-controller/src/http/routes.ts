import { Router } from "express";
import type { ServerApi } from "@/server/service.js";
import { createServerRoutes } from "@/server/routes.js";
import type { MaintenanceApi } from "@/maintenance/service.js";
import { createMaintenanceRoutes } from "@/maintenance/routes.js";
import type { BackupApi } from "@/backups/service.js";
import { createBackupRoutes } from "@/backups/routes.js";
export interface CreateRoutesOptions {
  readonly server: ServerApi;
  readonly maintenance: MaintenanceApi;
  readonly backups: BackupApi;
}
export function createRoutes({ server, maintenance, backups }: CreateRoutesOptions): Router {
  const router = Router();
  router.use(createServerRoutes(server));
  router.use("/backups", createBackupRoutes(backups));
  router.use("/maintenance", createMaintenanceRoutes(maintenance));
  // Historical clients keep their established operation/recovery URLs.
  router.use("/backups", createMaintenanceRoutes(maintenance));
  return router;
}
