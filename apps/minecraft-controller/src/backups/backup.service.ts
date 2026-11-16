import { randomUUID } from "node:crypto";
import { z } from "zod";
import { backupTierSchema } from "@minecraft-control-plane/shared/minecraft";
import { defineTask, type RegisteredTask } from "@/maintenance/service.js";
import { ControllerError } from "@/errors.js";
import { serverCheckpointSchema, serverSession, type ServerOperations } from "@/server/service.js";
import type { ServerDataOperations } from "@/server-data/service.js";
import type { Clock } from "@/time.js";
import type { SnapshotOperations } from "./service.js";
const request = z.object({
  origin: z.enum(["manual", "scheduled"]),
  tiers: z.array(backupTierSchema),
});
const state = serverCheckpointSchema.extend({ backupId: z.uuid().nullable().default(null) });
export function backupTask(
  snapshots: SnapshotOperations,
  server: ServerOperations,
  files: ServerDataOperations,
  clock: Clock,
): RegisteredTask {
  return defineTask({
    kind: "backup",
    version: 2,
    request,
    state,
    initial: () => state.parse({}),
    canBoot: () => true,
    prepare: (ctx) => server.capture(serverSession(ctx)),
    async apply(ctx) {
      const session = serverSession(ctx),
        installation = await snapshots.installation();
      if (!installation.version)
        throw new ControllerError("BACKUP_INCOMPATIBLE", installation.reasons.join(" "));
      let method: "online" | "offline" = "offline";
      if (ctx.state().wasRunning) {
        if ((await server.players()) === 0) await server.suspend(session);
        else {
          method = "online";
          await server.saving(session, false);
          await server.flush(session);
        }
      }
      const id = randomUUID();
      await ctx.step(
        "archive-planned",
        { ...ctx.state(), backupId: id },
        { phase: "Creating and verifying the backup", result: { backupId: id } },
      );
      const captured = await snapshots.capture(ctx, {
        id,
        createdAt: clock.now().toISOString(),
        origin: ctx.request.origin,
        tiers: [...ctx.request.tiers],
        method,
        installation,
      });
      await ctx.step("archive-verified", ctx.state(), {
        changes: [captured.change],
        result: { backupId: id },
      });
      if (ctx.state().savingDisabled) await server.saving(session, true);
      await server.resume(session);
    },
    async recover(ctx) {
      if (!ctx.state().containerId) return;
      const session = serverSession(ctx);
      // An interrupted online backup may find a fresh container waiting at the gate.
      if (ctx.interrupted && ctx.state().wasRunning) await server.start(session);
      if (ctx.state().savingDisabled) await server.saving(session, true);
      await server.resume(session);
    },
    async hold(ctx) {
      if (ctx.state().containerId) await server.hold(ctx.state(), () => ctx.assertCurrent(), false);
    },
    async cleanup(ctx) {
      if (ctx.outcome() === "failed" && ctx.request.origin === "scheduled")
        await snapshots.releaseFailedSchedule(ctx, ctx.state().backupId);
      if (ctx.outcome() === "succeeded") await snapshots.prune(ctx);
      await files.cleanup(ctx);
    },
  });
}
