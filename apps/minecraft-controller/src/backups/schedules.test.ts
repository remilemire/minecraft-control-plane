import { describe, expect, it } from "vitest";
import { applyRetention, nextOccurrence } from "./schedules.js";
import type { BackupRecord, BackupTier } from "@minecraft-control-plane/shared/minecraft";

describe("calendar schedules", () => {
  it("honors an hourly boundary in a timezone with a fractional UTC offset", () => {
    expect(nextOccurrence("hourly", new Date("2026-09-10T18:00:00Z"), "Asia/Kathmandu")).toBe(
      "2026-09-10T18:15:00.000Z",
    );
  });
  it.each([
    ["hourly", "2026-09-10T18:37:00Z", "2026-09-10T19:00:00.000Z"],
    ["daily", "2026-09-10T18:37:00Z", "2026-09-11T06:00:00.000Z"],
    ["weekly", "2026-09-10T18:37:00Z", "2026-09-14T06:00:00.000Z"],
    ["monthly", "2026-09-10T18:37:00Z", "2026-10-01T06:00:00.000Z"],
    ["monthly", "2026-12-31T23:59:00Z", "2027-01-01T07:00:00.000Z"],
    ["hourly", "2026-03-08T08:00:00Z", "2026-03-08T09:00:00.000Z"],
    ["daily", "2026-03-08T07:00:00Z", "2026-03-09T06:00:00.000Z"],
    ["hourly", "2026-11-01T07:00:00Z", "2026-11-01T08:00:00.000Z"],
    ["daily", "2026-11-01T06:00:00Z", "2026-11-02T07:00:00.000Z"],
  ])("%s after %s", (tier, after, expected) => {
    expect(nextOccurrence(tier as BackupTier, new Date(after), "America/Edmonton")).toBe(expected);
  });
});

function record(
  id: string,
  tiers: BackupTier[],
  origin: BackupRecord["origin"] = "scheduled",
): BackupRecord {
  return {
    id,
    tiers,
    origin,
    createdAt: `2026-09-${id.padStart(2, "0")}T00:00:00Z`,
    contents: "full",
    format: "tar.gz",
    method: "offline",
    sizeBytes: 1,
    expandedBytes: 1,
    fileCount: 1,
    sha256: "a".repeat(64),
    version: null,
    worldName: "world",
  };
}
describe("independent retention pools", () => {
  it("retains an archive until all its memberships expire", () => {
    const records = [
      record("1", ["hourly", "monthly"]),
      record("2", ["hourly"]),
      record("3", ["hourly"]),
      record("4", [], "manual"),
      record("5", [], "safety"),
    ];
    const result = applyRetention(
      records,
      { hourly: true, daily: true, weekly: true, monthly: true },
      { hourly: 1, daily: 5, weekly: 3, monthly: 2 },
    );
    expect(result[0]?.tiers).toEqual(["monthly"]);
    expect(result[1]?.tiers).toEqual([]);
    expect(result[2]?.tiers).toEqual(["hourly"]);
    expect(result.slice(3)).toEqual(records.slice(3));
    expect(records[0]?.tiers).toEqual(["hourly", "monthly"]);
  });
  it("does not prune disabled pools", () => {
    const records = [record("1", ["daily"]), record("2", ["daily"])];
    expect(
      applyRetention(
        records,
        { hourly: false, daily: false, weekly: false, monthly: false },
        { hourly: 1, daily: 1, weekly: 1, monthly: 1 },
      ),
    ).toEqual(records);
  });
});
