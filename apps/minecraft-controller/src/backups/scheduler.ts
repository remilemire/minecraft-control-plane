import { randomUUID } from "node:crypto";
import type {
  BackupTier,
  BackupSchedulesInput,
  BackupSchedulesResponse,
} from "@minecraft-control-plane/shared/minecraft";
import type { MaintenanceService } from "@/maintenance/service.js";
import type { ControllerStore } from "@/state/store.js";
import { nextOccurrence, TIERS } from "./schedules.js";
export class BackupScheduler {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  public constructor(
    private readonly store: ControllerStore,
    private readonly maintenance: MaintenanceService,
    private readonly timezone: string,
    private readonly retention: Record<BackupTier, number>,
    private readonly now: () => Date,
  ) {}
  public async initialize(): Promise<void> {
    const state = this.store.data;
    if (state.timezone !== this.timezone) {
      state.timezone = this.timezone;
      for (const tier of TIERS)
        state.nextRuns[tier] = state.enabled[tier]
          ? nextOccurrence(tier, this.now(), this.timezone)
          : null;
    }
  }
  public schedules(): BackupSchedulesResponse {
    return {
      enabled: { ...this.store.data.enabled },
      timezone: this.timezone,
      retention: { ...this.retention },
      nextRuns: { ...this.store.data.nextRuns },
    };
  }
  public updateSchedules(enabled: BackupSchedulesInput): Promise<BackupSchedulesResponse> {
    return this.maintenance.exclusive(async () => {
      const state = this.store.data;
      for (const tier of TIERS)
        if (enabled[tier] !== state.enabled[tier])
          state.nextRuns[tier] = enabled[tier]
            ? nextOccurrence(tier, this.now(), this.timezone)
            : null;
      state.enabled = { ...enabled };
      await this.store.persist();
      return this.schedules();
    });
  }
  public async tick(): Promise<void> {
    if (!this.maintenance.ready || this.maintenance.activeOperation()) return;
    const state = this.store.data,
      now = this.now();
    const due = TIERS.filter(
      (t) =>
        state.enabled[t] &&
        state.nextRuns[t] !== null &&
        new Date(state.nextRuns[t]!).getTime() <= now.getTime(),
    );
    if (!due.length) return;
    await this.maintenance.submit(
      { kind: "backup", requestId: randomUUID(), origin: "scheduled", tiers: due },
      () => {
        for (const tier of due)
          state.nextRuns[tier] = nextOccurrence(tier, this.now(), this.timezone);
      },
    );
  }
  public start(): void {
    this.stopped = false;
    const tick = async () => {
      try {
        await this.tick();
      } catch (error) {
        console.error("Backup scheduler", error);
      }
      if (!this.stopped)
        this.timer = setTimeout(() => {
          void tick();
        }, 1000);
    };
    this.timer = setTimeout(() => {
      void tick();
    }, 1000);
  }
  public stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
