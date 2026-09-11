import { Router } from "express";
import {
  backupIdSchema,
  backupListResponseSchema,
  backupOperationAcceptedSchema,
  backupRequestSchema,
  backupRestorePreviewSchema,
  backupSchedulesInputSchema,
  backupSchedulesResponseSchema,
  maintenanceOperationSchema,
} from "@minecraft-control-plane/shared/minecraft";
import type { BackupManager } from "./manager.js";

export function createBackupRoutes(backups: BackupManager): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.json(backupListResponseSchema.parse(await backups.list()));
  });
  router.post("/", async (req, res) => {
    const { requestId } = backupRequestSchema.parse(req.body);
    res
      .status(202)
      .json(backupOperationAcceptedSchema.parse({ operationId: await backups.create(requestId) }));
  });
  router.get("/schedules", (_req, res) => {
    res.json(backupSchedulesResponseSchema.parse(backups.schedules()));
  });
  router.put("/schedules", async (req, res) => {
    res.json(
      backupSchedulesResponseSchema.parse(
        await backups.updateSchedules(backupSchedulesInputSchema.parse(req.body)),
      ),
    );
  });
  router.get("/operations/:id", (req, res) => {
    res.json(
      maintenanceOperationSchema.parse(backups.operation(backupIdSchema.parse(req.params.id))),
    );
  });
  router.post("/migrate", async (req, res) => {
    const { requestId } = backupRequestSchema.parse(req.body);
    res
      .status(202)
      .json(backupOperationAcceptedSchema.parse({ operationId: await backups.migrate(requestId) }));
  });
  router.post("/recover", async (_req, res) => {
    await backups.recover();
    res.status(204).end();
  });
  router.get("/:id/restore-preview", async (req, res) => {
    res.json(
      backupRestorePreviewSchema.parse(await backups.preview(backupIdSchema.parse(req.params.id))),
    );
  });
  router.post("/:id/restore", async (req, res) => {
    const { requestId } = backupRequestSchema.parse(req.body);
    res.status(202).json(
      backupOperationAcceptedSchema.parse({
        operationId: await backups.restore(backupIdSchema.parse(req.params.id), requestId),
      }),
    );
  });
  router.delete("/:id", async (req, res) => {
    await backups.delete(backupIdSchema.parse(req.params.id));
    res.status(204).end();
  });
  return router;
}
