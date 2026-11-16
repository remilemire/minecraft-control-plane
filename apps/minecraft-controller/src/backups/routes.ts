import { Router } from "express";
import {
  backupIdSchema,
  backupListResponseSchema,
  backupOperationAcceptedSchema,
  backupRequestSchema,
  backupRestorePreviewSchema,
  backupSchedulesInputSchema,
  backupSchedulesResponseSchema,
} from "@minecraft-control-plane/shared/minecraft";
import type { BackupService } from "./service.js";
import type { BackupScheduler } from "./scheduler.js";

export function createBackupRoutes(backups: BackupService, scheduler: BackupScheduler): Router {
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
    res.json(backupSchedulesResponseSchema.parse(scheduler.schedules()));
  });
  router.put("/schedules", async (req, res) => {
    res.json(
      backupSchedulesResponseSchema.parse(
        await scheduler.updateSchedules(backupSchedulesInputSchema.parse(req.body)),
      ),
    );
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
