import { Router } from "express";
import {
  backupIdSchema,
  maintenanceOperationSchema,
} from "@minecraft-control-plane/shared/minecraft";
import type { MaintenanceApi } from "./service.js";
export function createMaintenanceRoutes(service: MaintenanceApi): Router {
  const router = Router();
  router.get("/operations/:id", (req, res) => {
    res.json(
      maintenanceOperationSchema.parse(service.operation(backupIdSchema.parse(req.params.id))),
    );
  });
  router.post("/recover", async (_req, res) => {
    await service.recover();
    res.status(204).end();
  });
  return router;
}
