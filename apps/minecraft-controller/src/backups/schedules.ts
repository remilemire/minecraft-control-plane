import { Cron } from "croner";
import type {
  BackupRecord,
  BackupSchedulesInput,
  BackupTier,
} from "@minecraft-control-plane/shared/minecraft";

export const TIERS = ["hourly", "daily", "weekly", "monthly"] as const;
export const DISABLED_SCHEDULES: BackupSchedulesInput = {
  hourly: false,
  daily: false,
  weekly: false,
  monthly: false,
};
const PATTERNS: Record<BackupTier, string> = {
  hourly: "0 * * * *",
  daily: "0 0 * * *",
  weekly: "0 0 * * 1",
  monthly: "0 0 1 * *",
};

export function nextOccurrence(tier: BackupTier, after: Date, timezone: string): string {
  if (tier === "hourly") {
    // Calendar cron skips the repeated wall-clock hour in autumn. Hourly
    // backups cover both real hours, including zones with fractional offsets.
    const clock = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      minute: "numeric",
      second: "numeric",
    });
    let next = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000;
    for (let minute = 0; minute < 180; minute++, next += 60_000) {
      if (
        clock
          .formatToParts(next)
          .filter((part) => part.type === "minute" || part.type === "second")
          .every((part) => Number(part.value) === 0)
      )
        return new Date(next).toISOString();
    }
    throw new Error("No next hourly backup occurrence.");
  }
  const job = new Cron(PATTERNS[tier], { timezone, paused: true });
  try {
    const next = job.nextRun(after);
    if (next === null) throw new Error("No next backup occurrence.");
    return next.toISOString();
  } finally {
    job.stop();
  }
}

// A shared archive retains one membership per schedule. Manual/safety/legacy
// archives never enter retention, and disabled pools remain untouched.
export function applyRetention(
  records: BackupRecord[],
  enabled: BackupSchedulesInput,
  limits: Record<BackupTier, number>,
): BackupRecord[] {
  const result = records.map((r) => ({ ...r, tiers: [...r.tiers] }));
  for (const tier of TIERS) {
    if (!enabled[tier]) continue;
    const pool = result
      .filter((r) => r.origin === "scheduled" && r.tiers.includes(tier))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const old of pool.slice(limits[tier])) old.tiers = old.tiers.filter((t) => t !== tier);
  }
  return result;
}
