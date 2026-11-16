import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ControllerError } from "@/errors.js";
import { defineTask, type RegisteredTask, type TaskContext } from "@/maintenance/service.js";
import { serverCheckpointSchema, serverSession, type ServerOperations } from "@/server/service.js";
import {
  replacementSchema,
  type ServerDataOperations,
  type ReplacementSession,
} from "@/server-data/service.js";
import type { Clock } from "@/time.js";
import type { SnapshotOperations } from "./service.js";
const request = z.strictObject({ backupId: z.uuid() });
const state = serverCheckpointSchema
  .and(replacementSchema)
  .and(
    z.object({
      safetyBackupId: z.uuid().nullable().default(null),
      safetyVerified: z.boolean().default(false),
    }),
  )
  .superRefine((value, context) => {
    if (
      (value.safetyVerified && !value.safetyBackupId) ||
      (value.replacementStarted && !value.safetyVerified)
    )
      context.addIssue({
        code: "custom",
        message: "Replacement checkpoints require verified safety.",
      });
  });
type Request = z.infer<typeof request>;
type State = z.infer<typeof state>;
export function restoreTask(
  snapshots: SnapshotOperations,
  server: ServerOperations,
  files: ServerDataOperations,
  clock: Clock,
): RegisteredTask {
  const dataSession = (ctx: TaskContext<Request, State>): ReplacementSession => ({
    id: ctx.id,
    assertActive: () => ctx.assertActive(),
    read: () => ctx.state(),
    assertStopped: () => server.assertStopped(serverSession(ctx)),
    record: (patch, checkpoint, phase) =>
      ctx.step(checkpoint, { ...ctx.state(), ...patch }, phase ? { phase } : {}),
  });
  const check = async (id: string) => {
    const backup = snapshots.record(id),
      installation = await snapshots.installation(),
      compatibility = snapshots.compare(backup.version, installation);
    if (
      !compatibility.compatible ||
      backup.format !== "tar.gz" ||
      backup.contents !== "full" ||
      backup.worldName !== installation.worldName
    )
      throw new ControllerError(
        "BACKUP_INCOMPATIBLE",
        compatibility.reasons.join(" ") ||
          "The backup contents or world name do not match this server.",
      );
    return installation;
  };
  return defineTask({
    kind: "restore",
    version: 2,
    request,
    state,
    initial: () => state.parse({}),
    result: (request) => ({ backupId: request.backupId }),
    canBoot: (state) =>
      state.liveDataSafe &&
      !state.rollbackPending &&
      (!state.replacementStarted || state.replacementComplete),
    destructive: true,
    async prepare(ctx) {
      const session = serverSession(ctx);
      await server.capture(session);
      await check(ctx.request.backupId);
      await snapshots.requireSpace(ctx.request.backupId);
      const staged = await files.prepare(ctx);
      await ctx.step("staging", ctx.state(), {
        phase: "Validating and staging the selected backup",
      });
      await snapshots.stage(ctx, ctx.request.backupId, staged);
      if (
        !snapshots.compare(
          snapshots.record(ctx.request.backupId).version,
          await snapshots.installation(staged),
        ).compatible
      )
        throw new ControllerError(
          "BACKUP_INCOMPATIBLE",
          "The staged installation does not match its version record.",
        );
      if (ctx.state().wasRunning && (await server.players()) > 0) {
        await server.announce(
          session,
          "Server recovery starts in 30 seconds. You will be disconnected while the selected backup is restored.",
        );
        await ctx.step("countdown", ctx.state(), { phase: "Server shutdown in 30 seconds" });
        await clock.sleep(30_000);
      }
      await check(ctx.request.backupId);
      await server.suspend(session);
      await check(ctx.request.backupId);
    },
    async safetyBackup(ctx) {
      const id = randomUUID();
      await ctx.step(
        "safety-planned",
        { ...ctx.state(), safetyBackupId: id },
        { phase: "Creating and verifying the safety backup", result: { safetyBackupId: id } },
      );
      const captured = await snapshots.capture(ctx, {
        id,
        createdAt: clock.now().toISOString(),
        origin: "safety",
        method: "offline",
        tiers: [],
        installation: await snapshots.installation(),
      });
      await ctx.step(
        "safety-verified",
        { ...ctx.state(), safetyVerified: true },
        { changes: [captured.change], result: { safetyBackupId: id } },
      );
    },
    verifiedSafety: (state) => state.safetyVerified && state.safetyBackupId !== null,
    async apply(ctx) {
      const installation = await check(ctx.request.backupId);
      await server.assertStopped(serverSession(ctx));
      await files.preserveAccess(ctx);
      await files.replace(dataSession(ctx));
      await files.enforceSettings(ctx, installation.worldName);
      await ctx.step("replacement-ready", { ...ctx.state(), liveDataSafe: true });
    },
    verify: (ctx) => server.resume(serverSession(ctx)),
    async recover(ctx) {
      if (!ctx.state().containerId) return;
      const session = serverSession(ctx);
      if (
        ctx.interrupted ||
        ctx.state().stoppedByOperation ||
        ctx.state().replacementStarted ||
        ctx.state().rollbackPending
      )
        await server.suspend(session);
      if (ctx.state().savingDisabled) await server.saving(session, true);
      if (ctx.state().replacementStarted || ctx.state().rollbackPending) {
        await ctx.step(
          "rollback-planned",
          { ...ctx.state(), rollbackPending: true, liveDataSafe: false },
          { phase: "Recovering the pre-restore data" },
        );
        await files.rollback(dataSession(ctx));
        const safety = ctx.state().safetyBackupId;
        if (!safety)
          throw new ControllerError(
            "BACKUP_RECOVERY_REQUIRED",
            "Recovered files have no safety snapshot to verify. Inspect the original data before starting Minecraft.",
          );
        await server.assertStopped(session);
        await snapshots.verifyOriginal(ctx, safety);
        await ctx.step("rollback-verified", {
          ...ctx.state(),
          rollbackPending: false,
          liveDataSafe: true,
        });
      }
      await server.resume(session);
    },
    async hold(ctx) {
      const data = ctx.state();
      if (
        data.containerId &&
        (data.stoppedByOperation || data.replacementStarted || data.rollbackPending)
      )
        await server.hold(data, () => ctx.assertCurrent(), true);
    },
    cleanup: (ctx) => files.cleanup(ctx),
  });
}
