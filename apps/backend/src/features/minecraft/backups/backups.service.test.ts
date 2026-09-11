import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { FakeBackupsClient } from "@test/fakes/fake-backups.client.js";
import { MinecraftBackupService } from "./backups.service.js";

describe("MinecraftBackupService", () => {
  it("returns a previously accepted restore without repeating preflight", async () => {
    const client = new FakeBackupsClient();
    const id = randomUUID();
    const backupId = randomUUID();
    client.operations.set(id, {
      id,
      backupId,
      kind: "restore",
      status: "running",
      phase: "Replacing",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      safetyBackupId: null,
      error: null,
    });
    const preview = vi.spyOn(client, "preview");
    expect(await new MinecraftBackupService(client).restore(backupId, id)).toBe(id);
    expect(preview).not.toHaveBeenCalled();
    expect(client.calls).toEqual([]);
  });
  it("rejects reuse of another operation's request ID", async () => {
    const client = new FakeBackupsClient();
    const id = randomUUID();
    client.operations.set(id, {
      id,
      backupId: null,
      kind: "backup",
      status: "succeeded",
      phase: "Complete",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      safetyBackupId: null,
      error: null,
    });
    await expect(
      new MinecraftBackupService(client).restore(randomUUID(), id),
    ).rejects.toMatchObject({ code: "BACKUP_REQUEST_CONFLICT" });
  });
});
