import {
  backupIdSchema,
  backupListResponseSchema,
  backupOperationAcceptedSchema,
  backupRequestSchema,
  backupRestorePreviewSchema,
  backupSchedulesInputSchema,
  backupSchedulesResponseSchema,
  maintenanceOperationSchema,
  type BackupSchedulesInput,
} from "@minecraft-control-plane/shared/minecraft";
import type { BackupsApi } from "@/features/minecraft/backups/backups.types.js";
import { AppError } from "@/errors/app-error.js";
import { ControllerHttpClient, type ControllerHttpOptions } from "./controller-http.client.js";
import type { ZodType } from "zod";

export class BackupsClient implements BackupsApi {
  private readonly http: ControllerHttpClient;
  public constructor(options: ControllerHttpOptions) {
    this.http = new ControllerHttpClient(options, "BACKUP_CONTROLLER_ERROR");
  }
  private async json<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    schema: ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const response = await this.http.request(
      method,
      `/backups${path}`,
      AbortSignal.timeout(30_000),
      body,
    );
    try {
      return schema.parse(await response.json());
    } catch (cause) {
      throw new AppError("BACKUP_CONTROLLER_ERROR", { cause });
    }
  }
  public list() {
    return this.json("GET", "", backupListResponseSchema);
  }
  public schedules() {
    return this.json("GET", "/schedules", backupSchedulesResponseSchema);
  }
  public updateSchedules(input: BackupSchedulesInput) {
    return this.json(
      "PUT",
      "/schedules",
      backupSchedulesResponseSchema,
      backupSchedulesInputSchema.parse(input),
    );
  }
  public async create(requestId: string) {
    return (
      await this.json(
        "POST",
        "",
        backupOperationAcceptedSchema,
        backupRequestSchema.parse({ requestId }),
      )
    ).operationId;
  }
  public preview(id: string) {
    return this.json(
      "GET",
      `/${backupIdSchema.parse(id)}/restore-preview`,
      backupRestorePreviewSchema,
    );
  }
  public async restore(id: string, requestId: string) {
    return (
      await this.json(
        "POST",
        `/${backupIdSchema.parse(id)}/restore`,
        backupOperationAcceptedSchema,
        backupRequestSchema.parse({ requestId }),
      )
    ).operationId;
  }
  public async delete(id: string) {
    await this.http.request(
      "DELETE",
      `/backups/${backupIdSchema.parse(id)}`,
      AbortSignal.timeout(30_000),
    );
  }
  public operation(id: string) {
    return this.json("GET", `/operations/${backupIdSchema.parse(id)}`, maintenanceOperationSchema);
  }
}
