import { join } from "node:path";
import type { BackupSchedulesInput, BackupTier } from "@minecraft-control-plane/shared/minecraft";
import type { MinecraftRuntime, MinecraftReader } from "@/runtime/service.js";
import { systemClock, type Clock } from "@/time.js";
import { StateService } from "@/state/service.js";
import { MaintenanceCoordinator } from "@/maintenance/coordinator.js";
import { MaintenanceService, type MaintenanceApi } from "@/maintenance/service.js";
import { validateTaskRecord } from "@/maintenance/task.js";
import type { RegisteredTask } from "@/maintenance/contracts.js";
import { StartupGate } from "@/maintenance/startup-gate.js";
import { ServerService, createServerOperations, type ServerApi } from "@/server/service.js";
import { powerTasks } from "@/server/power.service.js";
import { createInstallationService } from "@/installation/service.js";
import { ServerDataService } from "@/server-data/service.js";
import { SnapshotService } from "@/backups/snapshot.service.js";
import { ScheduleService } from "@/backups/schedule.service.js";
import { BackupService, type BackupApi } from "@/backups/service.js";
import { backupTask } from "@/backups/backup.service.js";
import { restoreTask } from "@/backups/restore.service.js";

export interface ControllerOptions {
  dataRoot: string;
  timezone: string;
  retention: Record<BackupTier, number>;
  runtime: MinecraftRuntime & MinecraftReader;
  clock?: Clock;
}
export function createController(options: ControllerOptions) {
  const clock = options.clock ?? systemClock;
  const tasks = new Map<string, RegisteredTask>();
  const gate = new StartupGate(join(options.dataRoot, "startup-gate"), options.runtime);
  const state = new StateService(
    join(options.dataRoot, "backup-state"),
    options.timezone,
    (record) => validateTaskRecord(tasks, record),
  );
  const operations = createServerOperations(options.runtime);
  const dataPath = join(options.dataRoot, "minecraft");
  const installation = createInstallationService(dataPath, options.runtime);
  const files = new ServerDataService(dataPath, join(options.dataRoot, "backup-recovery"));
  const snapshots = new SnapshotService(
    join(options.dataRoot, "backups"),
    dataPath,
    state.catalogue(),
    state.schedules(),
    installation,
    options.retention,
  );
  for (const task of [
    ...powerTasks(operations),
    backupTask(snapshots, operations, files, clock),
    restoreTask(snapshots, operations, files, clock),
  ]) {
    if (tasks.has(task.kind)) throw new Error(`Duplicate task: ${task.kind}`);
    tasks.set(task.kind, task);
  }
  const coordinator = new MaintenanceCoordinator(state.journal(), tasks, gate, clock, {
    available: async () => {
      await options.runtime.inspect();
    },
    reconcile: async () => {
      if (!state.journal().healthy()) await state.reopen();
      await snapshots.reconcile();
    },
  });
  const maintenance = new MaintenanceService(coordinator);
  const server = new ServerService(options.runtime, maintenance);
  const schedule = new ScheduleService(
    state.schedules(),
    maintenance,
    options.timezone,
    options.retention,
    clock,
  );
  const backups = new BackupService(snapshots, maintenance, operations, schedule);
  const publicBackups: BackupApi = Object.freeze({
    list: () => backups.list(),
    create: (requestId: string) => backups.create(requestId),
    restore: (backupId: string, requestId: string) => backups.restore(backupId, requestId),
    preview: (id: string) => backups.preview(id),
    delete: (id: string) => backups.delete(id),
    schedules: () => backups.schedules(),
    updateSchedules: (enabled: BackupSchedulesInput) => backups.updateSchedules(enabled),
  });
  const publicMaintenance: MaintenanceApi = Object.freeze({
    operation: (id: string) => maintenance.operation(id),
    activeOperation: () => maintenance.activeOperation(),
    latestOperation: () => maintenance.latestOperation(),
    recover: () => maintenance.recover(),
  });
  const publicServer: ServerApi = Object.freeze({
    power: (kind: "start" | "stop" | "restart") => server.power(kind),
    execute: (command: string) => server.execute(command),
    getStatus: () => server.getStatus(),
    openLogStream: (signal: AbortSignal) => server.openLogStream(signal),
    closeLogStreams: () => server.closeLogStreams(),
  });
  let closing: Promise<void> | undefined;
  let initialization: Promise<void> | undefined;
  let initialized = false;
  return Object.freeze({
    server: publicServer,
    backups: publicBackups,
    maintenance: publicMaintenance,
    initialize(): Promise<void> {
      if (closing) return Promise.reject(new Error("The application is shutting down."));
      initialization ??= (async () => {
        await gate.initialize();
        await state.initialize();
        await schedule.initialize();
        await maintenance.initialize();
        initialized = true;
      })();
      return initialization;
    },
    start() {
      if (!initialized || closing)
        throw new Error("Initialize the application before starting its workers.");
      maintenance.start();
      schedule.start();
    },
    close(): Promise<void> {
      closing ??= (async () => {
        schedule.stop();
        server.closeLogStreams();
        const draining = maintenance.close();
        if (initialization) await initialization.catch(() => {});
        await draining;
        await gate.close();
      })();
      return closing;
    },
  });
}
export type ControllerApplication = ReturnType<typeof createController>;
