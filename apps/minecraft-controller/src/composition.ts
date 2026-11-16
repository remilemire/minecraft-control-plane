import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { BackupTier } from "@minecraft-control-plane/shared/minecraft";
import { publicFailure } from "@/errors.js";
import type { MinecraftRuntime, MinecraftReader } from "@/runtime/contracts.js";
import { ControllerStore } from "@/state/store.js";
import { atomicText } from "@/state/atomic-files.js";
import { MaintenanceCoordinator, type MaintenanceTask } from "@/maintenance/coordinator.js";
import { MaintenanceService } from "@/maintenance/service.js";
import type { StartupAuthorization } from "@/maintenance/startup-gate.js";
import { ArchiveStorage } from "@/backups/archive.js";
import { BackupService } from "@/backups/service.js";
import { BackupScheduler } from "@/backups/scheduler.js";
import { ServerService } from "@/server/service.js";
import { ServerTaskLifecycle } from "@/tasks/server-lifecycle.js";
import { BackupTask } from "@/tasks/backup.js";
import { RestoreTask } from "@/tasks/restore.js";
import { RestoreFiles } from "@/tasks/restore-files.js";
import { PowerTask } from "@/tasks/power.js";
import { retiredMigration } from "@/tasks/legacy-recovery.js";
import { createOperation } from "@/tasks/requests.js";
import { registerTask } from "@/tasks/registry.js";
import type { OperationJournal } from "@/tasks/operations.js";
export interface ControllerOptions {
  dataRoot: string;
  timezone: string;
  retention: Record<BackupTier, number>;
  runtime: MinecraftRuntime & MinecraftReader;
  now?: () => Date;
  countdown?: () => Promise<void>;
  startupGate?: StartupAuthorization | undefined;
  observer?: (operation: OperationJournal, event: string) => Promise<void>;
}
export function createController(options: ControllerOptions) {
  const now = options.now ?? (() => new Date());
  const store = new ControllerStore(join(options.dataRoot, "backup-state"));
  const tasks = new Map<string, MaintenanceTask<OperationJournal>>();
  const coordinator = new MaintenanceCoordinator<OperationJournal>({
    operations: () => store.data.operations,
    persist: () => store.persist(),
    tasks,
    gate: options.startupGate,
    available: async () => {
      await options.runtime.inspect();
    },
    describe: publicFailure,
    now,
    observer: options.observer,
  });
  const maintenance = new MaintenanceService(coordinator, (request) =>
    createOperation(request, now),
  );
  const storage = new ArchiveStorage(join(options.dataRoot, "backups"), async (event) => {
    const op = maintenance.activeJournal();
    if (op) await options.observer?.(op, event);
  });
  const backups = new BackupService(
    storage,
    join(options.dataRoot, "minecraft"),
    store,
    options.runtime,
    maintenance,
    options.retention,
    now,
  );
  const scheduler = new BackupScheduler(
    store,
    maintenance,
    options.timezone,
    options.retention,
    now,
  );
  const server = new ServerService(options.runtime, options.runtime, maintenance);
  const recoveryRoot = join(options.dataRoot, "backup-recovery");
  const lifecycle = new ServerTaskLifecycle(options.runtime, store, recoveryRoot, options.observer);
  const files = new RestoreFiles(
    backups.dataPath,
    recoveryRoot,
    backups,
    options.runtime,
    store,
    lifecycle,
  );
  registerTask(tasks, "backup", new BackupTask(backups, options.runtime, store, lifecycle));
  registerTask(
    tasks,
    "restore",
    new RestoreTask(
      backups.dataPath,
      recoveryRoot,
      backups,
      options.runtime,
      store,
      lifecycle,
      files,
      options.countdown,
    ),
  );
  const power = new PowerTask(options.runtime, lifecycle);
  registerTask(tasks, "start", power);
  registerTask(tasks, "stop", power);
  registerTask(tasks, "restart", power);
  registerTask(tasks, "migration", retiredMigration(lifecycle));
  return {
    backups,
    maintenance,
    scheduler,
    server,
    async initialize() {
      await store.initialize(options.timezone);
      await mkdir(storage.root, { recursive: true, mode: 0o700 });
      await mkdir(recoveryRoot, { recursive: true, mode: 0o700 });
      await scheduler.initialize();
      await maintenance.initialize();
      await backups.initialize();
      await atomicText(join(store.root, "initialized"), "1\n");
      await maintenance.open();
    },
    start() {
      maintenance.start();
      scheduler.start();
    },
    async close() {
      scheduler.stop();
      await maintenance.close();
    },
  };
}
export type ControllerApplication = ReturnType<typeof createController>;
