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
import { parseOrThrow } from "@/validation/parse.js";
import type { Request, Response } from "express";
import type { MinecraftBackupService } from "./backups.service.js";

export class MinecraftBackupController {
  public constructor(private readonly service: MinecraftBackupService) {}
  public list = async (_req: Request, res: Response) => {
    res.json(backupListResponseSchema.parse(await this.service.list()));
  };
  public schedules = async (_req: Request, res: Response) => {
    res.json(backupSchedulesResponseSchema.parse(await this.service.schedules()));
  };
  public updateSchedules = async (req: Request, res: Response) => {
    res.json(
      backupSchedulesResponseSchema.parse(
        await this.service.updateSchedules(parseOrThrow(backupSchedulesInputSchema, req.body)),
      ),
    );
  };
  public create = async (req: Request, res: Response) => {
    const { requestId } = parseOrThrow(backupRequestSchema, req.body);
    res
      .status(202)
      .json(
        backupOperationAcceptedSchema.parse({ operationId: await this.service.create(requestId) }),
      );
  };
  public preview = async (req: Request, res: Response) => {
    res.json(
      backupRestorePreviewSchema.parse(
        await this.service.preview(parseOrThrow(backupIdSchema, req.params.id)),
      ),
    );
  };
  public restore = async (req: Request, res: Response) => {
    const { requestId } = parseOrThrow(backupRequestSchema, req.body);
    res.status(202).json(
      backupOperationAcceptedSchema.parse({
        operationId: await this.service.restore(
          parseOrThrow(backupIdSchema, req.params.id),
          requestId,
        ),
      }),
    );
  };
  public delete = async (req: Request, res: Response) => {
    await this.service.delete(parseOrThrow(backupIdSchema, req.params.id));
    res.status(204).end();
  };
  public operation = async (req: Request, res: Response) => {
    res.json(
      maintenanceOperationSchema.parse(
        await this.service.operation(parseOrThrow(backupIdSchema, req.params.id)),
      ),
    );
  };
}
