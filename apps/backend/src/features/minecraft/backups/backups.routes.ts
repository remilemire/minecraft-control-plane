import { Router, type RequestHandler } from "express";
import { requireCsrf } from "@/http/csrf/csrf.middleware.js";
import type { MinecraftBackupController } from "./backups.controller.js";

export function createMinecraftBackupRoutes(
  controller: MinecraftBackupController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth);
  router.get("/", controller.list);
  router.post("/", requireCsrf, controller.create);
  router.get("/schedules", controller.schedules);
  router.put("/schedules", requireCsrf, controller.updateSchedules);
  router.get("/operations/:id", controller.operation);
  router.get("/:id/restore-preview", controller.preview);
  router.post("/:id/restore", requireCsrf, controller.restore);
  router.delete("/:id", requireCsrf, controller.delete);
  return router;
}
