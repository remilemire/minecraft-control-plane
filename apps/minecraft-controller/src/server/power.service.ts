import { z } from "zod";
import { defineTask } from "@/maintenance/service.js";
import type { RegisteredTask } from "@/maintenance/service.js";
import { serverCheckpointSchema, serverSession, type ServerOperations } from "./service.js";

export function powerTasks(server: ServerOperations): RegisteredTask[] {
  return (["start", "stop", "restart"] as const).map((kind) =>
    defineTask({
      kind,
      version: 2,
      request: z.strictObject({}),
      state: serverCheckpointSchema,
      initial: () => serverCheckpointSchema.parse({}),
      canBoot: () => true,
      prepare: (context) => server.capture(serverSession(context)),
      async apply(context) {
        const session = serverSession(context);
        if (kind === "start") await server.start(session);
        else if (kind === "stop") {
          await server.suspend(session);
          await server.finish(session);
        } else {
          await server.suspend(session);
          await server.start(session);
        }
      },
      async recover(context) {
        if (!context.state().containerId) return;
        const session = serverSession(context);
        await server.suspend(session);
        await server.resume(session);
      },
      async hold(context) {
        const state = context.state();
        if (state.containerId)
          await server.hold(
            state,
            () => context.assertCurrent(),
            state.stoppedByOperation || !state.wasRunning,
          );
      },
    }),
  );
}
