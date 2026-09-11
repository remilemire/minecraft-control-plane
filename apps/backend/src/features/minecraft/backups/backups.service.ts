import type { BackupSchedulesInput } from "@minecraft-control-plane/shared/minecraft";
import type { BackupsApi } from "./backups.types.js";
import { AppError } from "@/errors/app-error.js";

export class MinecraftBackupService {
  public constructor(private readonly client: BackupsApi) {}
  public list() {
    return this.client.list();
  }
  public schedules() {
    return this.client.schedules();
  }
  public updateSchedules(input: BackupSchedulesInput) {
    return this.client.updateSchedules(input);
  }
  public create(requestId: string) {
    return this.client.create(requestId);
  }
  public preview(id: string) {
    return this.client.preview(id);
  }
  public async restore(id: string, requestId: string) {
    // A retried request may already be running; the durable controller is the
    // idempotency authority, so consult it before repeating preflight.
    try {
      const previous = await this.client.operation(requestId);
      if (previous.kind !== "restore" || previous.backupId !== id)
        throw new AppError("BACKUP_REQUEST_CONFLICT");
      return previous.id;
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "BACKUP_NOT_FOUND") throw error;
    }
    const preview = await this.client.preview(id);
    if (!preview.backup.compatibility.compatible) throw new AppError("BACKUP_INCOMPATIBLE");
    if (!preview.canRestore)
      throw new AppError(
        preview.availableBytes < preview.requiredBytes
          ? "BACKUP_STORAGE_FULL"
          : "MINECRAFT_MAINTENANCE",
      );
    return this.client.restore(id, requestId);
  }
  public delete(id: string) {
    return this.client.delete(id);
  }
  public operation(id: string) {
    return this.client.operation(id);
  }
}
