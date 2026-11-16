import { randomUUID } from "node:crypto";
import type {
  BackupSchedulesInput,
  BackupSchedulesResponse,
  BackupTier,
} from "@minecraft-control-plane/shared/minecraft";
import type { ScheduleStore } from "@/state/service.js";
import type { Admission } from "@/maintenance/service.js";
import type { Clock } from "@/time.js";
import { TIERS, nextOccurrence } from "./schedules.js";
export class ScheduleService {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  public constructor(
    private readonly store: ScheduleStore,
    private readonly admission: Admission,
    private readonly timezone: string,
    private readonly retention: Record<BackupTier, number>,
    private readonly clock: Clock,
  ) {}
  public async initialize(): Promise<void> {
    const current = this.store.read(),
      state = {
        enabled: { ...current.enabled },
        nextRuns: { ...current.nextRuns },
        timezone: current.timezone,
      };
    if (state.timezone === this.timezone) return;
    state.timezone = this.timezone;
    for (const tier of TIERS)
      state.nextRuns[tier] = state.enabled[tier]
        ? nextOccurrence(tier, this.clock.now(), this.timezone)
        : null;
    await this.store.commit([this.store.configure(state)]);
  }
  public read(): BackupSchedulesResponse {
    const state = this.store.read();
    return {
      enabled: { ...state.enabled },
      timezone: state.timezone,
      retention: { ...this.retention },
      nextRuns: { ...state.nextRuns },
    };
  }
  public update(enabled: BackupSchedulesInput): Promise<BackupSchedulesResponse> {
    return this.admission.exclusive(async () => {
      const current = this.store.read(),
        state = {
          enabled: { ...current.enabled },
          nextRuns: { ...current.nextRuns },
          timezone: current.timezone,
        };
      for (const tier of TIERS)
        if (enabled[tier] !== state.enabled[tier])
          state.nextRuns[tier] = enabled[tier]
            ? nextOccurrence(tier, this.clock.now(), this.timezone)
            : null;
      state.enabled = { ...enabled };
      await this.store.commit([this.store.configure(state)]);
      return this.read();
    });
  }
  private async tick(): Promise<void> {
    const current = this.store.read(),
      now = this.clock.now();
    if (this.admission.activeOperation()) return;
    const due = TIERS.filter(
      (tier) =>
        current.enabled[tier] &&
        current.nextRuns[tier] !== null &&
        new Date(current.nextRuns[tier]!).getTime() <= now.getTime(),
    );
    if (!due.length) return;
    const next = { ...current.nextRuns };
    for (const tier of due) next[tier] = nextOccurrence(tier, now, this.timezone);
    await this.admission.submit("backup", { origin: "scheduled", tiers: due }, randomUUID(), [
      this.store.consume({ ...current.nextRuns }, next),
    ]);
  }
  public start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const tick = async () => {
      try {
        await this.tick();
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "MINECRAFT_MAINTENANCE"))
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
