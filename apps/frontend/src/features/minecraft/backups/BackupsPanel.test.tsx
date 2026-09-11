import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BackupListItem,
  MaintenanceOperation,
} from "@minecraft-control-plane/shared/minecraft";
import { BackupsPanel } from "./BackupsPanel";
import {
  createBackup,
  deleteBackup,
  fetchBackups,
  fetchBackupSchedules,
  previewRestore,
  restoreBackup,
  updateBackupSchedules,
} from "./api";

vi.mock("./api", () => ({
  createBackup: vi.fn(),
  deleteBackup: vi.fn(),
  fetchBackups: vi.fn(),
  fetchBackupSchedules: vi.fn(),
  previewRestore: vi.fn(),
  restoreBackup: vi.fn(),
  updateBackupSchedules: vi.fn(),
}));
const backup: BackupListItem = {
  id: "8105f42f-eb90-41d6-93f3-f15e8d2b122f",
  createdAt: "2026-09-10T18:00:00Z",
  origin: "manual",
  contents: "full",
  format: "tar.gz",
  method: "offline",
  tiers: [],
  sizeBytes: 1024,
  expandedBytes: 2048,
  fileCount: 3,
  sha256: "a".repeat(64),
  worldName: "world",
  version: {
    serverType: "FTBA",
    minecraftVersion: "1.21.1",
    loader: "neoforge",
    loaderVersion: "21.1.243",
    modpackId: "130",
    modpackVersionId: "100440",
  },
  compatibility: { compatible: true, reasons: [] },
};
const enabled = { hourly: false, daily: false, weekly: false, monthly: false };
const settings = {
  enabled,
  timezone: "America/Edmonton",
  retention: { hourly: 6, daily: 5, weekly: 3, monthly: 2 },
  nextRuns: { hourly: null, daily: null, weekly: null, monthly: null },
};
const operation: MaintenanceOperation = {
  id: "74a605dc-e9e4-44e4-b23d-9bdaf2356879",
  kind: "restore",
  status: "running",
  phase: "Creating and verifying the safety backup",
  startedAt: "2026-09-10T19:00:00Z",
  finishedAt: null,
  backupId: backup.id,
  safetyBackupId: null,
  error: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchBackups).mockResolvedValue({
    backups: [backup],
    activeOperation: null,
    latestOperation: null,
    setupRequired: false,
  });
  vi.mocked(fetchBackupSchedules).mockResolvedValue(settings);
  vi.mocked(deleteBackup).mockResolvedValue(undefined);
  vi.mocked(updateBackupSchedules).mockResolvedValue(settings);
  vi.mocked(createBackup).mockImplementation(async (requestId) => ({ operationId: requestId }));
  vi.mocked(restoreBackup).mockImplementation(async (_id, requestId) => ({
    operationId: requestId,
  }));
  vi.mocked(previewRestore).mockResolvedValue({
    backup,
    currentVersion: backup.version,
    onlinePlayers: 2,
    running: true,
    availableBytes: 1024 ** 3,
    requiredBytes: 4096,
    canRestore: true,
    reasons: [],
  });
});
describe("BackupsPanel", () => {
  it("starts schedules disabled and changes only the selected frequency", async () => {
    const user = userEvent.setup();
    render(<BackupsPanel />);
    await screen.findByText(/Times use America\/Edmonton/);
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /weekly/i }));
    expect(updateBackupSchedules).toHaveBeenCalledWith({ ...enabled, weekly: true });
    expect(createBackup).not.toHaveBeenCalled();
  });
  it("keeps the idempotency key after an uncertain manual submission", async () => {
    vi.mocked(createBackup).mockRejectedValueOnce(new Error("Connection lost"));
    const user = userEvent.setup();
    render(<BackupsPanel />);
    await screen.findByText("Full server data", { exact: false });
    await user.click(screen.getByRole("button", { name: "Back up now" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Back up now" }));
    expect(createBackup).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createBackup).mock.calls[0]?.[0]).toBe(
      vi.mocked(createBackup).mock.calls[1]?.[0],
    );
  });
  it("requires a preview and explicit confirmation before restoring", async () => {
    const user = userEvent.setup();
    render(<BackupsPanel />);
    await user.click(await screen.findByRole("button", { name: "Review restore" }));
    const confirmation = await screen.findByRole("region", { name: "Restore confirmation" });
    expect(confirmation).toHaveTextContent("2 players online");
    expect(confirmation).toHaveTextContent("30-second announcement");
    expect(restoreBackup).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "Confirm restore" }));
    expect(restoreBackup).toHaveBeenCalledWith(backup.id, expect.any(String));
  });
  it("requires a second click before deleting", async () => {
    const user = userEvent.setup();
    render(<BackupsPanel />);
    await user.click(await screen.findByRole("button", { name: "Delete backup" }));
    expect(deleteBackup).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete permanently?" }));
    expect(deleteBackup).toHaveBeenCalledWith(backup.id);
  });
  it("recovers progress after reload and disables conflicting actions", async () => {
    vi.mocked(fetchBackups).mockResolvedValue({
      backups: [backup],
      activeOperation: operation,
      latestOperation: operation,
      setupRequired: false,
    });
    const onMaintenance = vi.fn();
    render(<BackupsPanel onMaintenance={onMaintenance} />);
    await screen.findByText(operation.phase);
    for (const name of ["Back up now", "Review restore", "Delete backup"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
    await waitFor(() => expect(onMaintenance).toHaveBeenCalledWith(operation));
  });
  it("shows an unverifiable legacy archive without enabling restore", async () => {
    vi.mocked(fetchBackups).mockResolvedValue({
      backups: [
        {
          ...backup,
          origin: "legacy",
          contents: "world",
          method: "legacy",
          format: "zip",
          version: null,
          compatibility: { compatible: false, reasons: ["Version metadata is missing."] },
        },
      ],
      activeOperation: null,
      latestOperation: null,
      setupRequired: false,
    });
    render(<BackupsPanel />);
    expect(await screen.findByText(/Version metadata is missing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review restore" })).toBeDisabled();
  });
});
