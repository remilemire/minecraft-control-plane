import type { MaintenanceTask } from "@/maintenance/coordinator.js";
import type { OperationJournal } from "./operations.js";
import type { ServerTaskLifecycle } from "./server-lifecycle.js";

// Only decodes/recovers historical journals. No import handler is retained.
export function retiredMigration(
  lifecycle: ServerTaskLifecycle,
): MaintenanceTask<Extract<OperationJournal, { kind: "migration" }>> {
  return {
    version: 1,
    legacyVersions: [0],
    apply: async () => {
      throw new Error("FTB backup import has been retired.");
    },
    recover: async (context) => {
      if (!context.operation.containerId) return;
      await lifecycle.enableSaving(context.operation);
      await lifecycle.resume(context);
    },
    hold: async () => {},
    cleanup: (context) => lifecycle.cleanup(context),
  };
}
