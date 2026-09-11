import { useCallback, useEffect, useRef, useState } from "react";
import { McPanel } from "@/components/McPanel";
import { McButton } from "@/components/McButton";
import { McConfirmButton } from "@/components/McConfirmButton";
import { McBadge } from "@/components/McBadge";
import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { useRequest } from "@/lib/useRequest";
import { usePoll } from "@/lib/usePoll";
import { toApiError, type ApiError } from "@/lib/apiClient";
import type {
  BackupRestorePreview,
  BackupTier,
  MaintenanceOperation,
  ServerVersion,
} from "@minecraft-control-plane/shared/minecraft";
import {
  createBackup,
  deleteBackup,
  fetchBackups,
  fetchBackupSchedules,
  previewRestore,
  restoreBackup,
  updateBackupSchedules,
} from "./api";

const TIERS: BackupTier[] = ["hourly", "daily", "weekly", "monthly"];
function bytes(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}
function versionLabel(version: ServerVersion | null): string {
  if (!version) return "Version not recorded";
  return `Minecraft ${version.minecraftVersion} · ${version.serverType}${version.modpackId ? ` · Pack ${version.modpackId}, version ${version.modpackVersionId}` : ""}${version.loader ? ` · ${version.loader} ${version.loaderVersion}` : ""}`;
}
function date(value: string): string {
  return new Date(value).toLocaleString();
}

export function BackupsPanel({
  onMaintenance,
}: {
  onMaintenance?: (operation: MaintenanceOperation | null) => void;
}) {
  const [submitted, setSubmitted] = useState<string | null>(null);
  const submittedRequest = useRef<string | null>(null);
  const loadBackups = useCallback(async () => {
    const request = submittedRequest.current;
    const result = await fetchBackups();
    // Only a fetch begun after acceptance can acknowledge that submission.
    if (request !== null && submittedRequest.current === request) {
      submittedRequest.current = null;
      setSubmitted(null);
    }
    return result;
  }, []);
  const backups = useRequest(loadBackups);
  const schedules = useRequest(fetchBackupSchedules);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [preview, setPreview] = useState<BackupRestorePreview | null>(null);
  const manualRequest = useRef<string | null>(null);
  const restoreRequest = useRef<string | null>(null);
  const operation = backups.data?.activeOperation ?? backups.data?.latestOperation ?? null;
  const active = backups.data?.activeOperation ?? null;
  const busy = pending || active !== null || submitted !== null;
  const initial = backups.loading && backups.data === null;

  usePoll(backups.reload, active || submitted ? 3000 : 15_000);
  usePoll(schedules.reload, 15_000);
  useEffect(() => {
    onMaintenance?.(active);
  }, [active, onMaintenance]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setActionError(null);
    try {
      await action();
      backups.reload();
      schedules.reload();
    } catch (error) {
      setActionError(toApiError(error));
    } finally {
      setPending(false);
    }
  }
  async function takeBackup() {
    manualRequest.current ??= crypto.randomUUID();
    const accepted = await createBackup(manualRequest.current);
    manualRequest.current = null;
    submittedRequest.current = accepted.operationId;
    setSubmitted(accepted.operationId);
  }
  async function showPreview(id: string) {
    setPreview(null);
    restoreRequest.current = crypto.randomUUID();
    setPreview(await previewRestore(id));
  }
  async function confirmRestore() {
    if (!preview || !restoreRequest.current) return;
    const accepted = await restoreBackup(preview.backup.id, restoreRequest.current);
    submittedRequest.current = accepted.operationId;
    setSubmitted(accepted.operationId);
    setPreview(null);
  }

  return (
    <McPanel
      title="Backups"
      actions={
        <McButton
          onClick={() => {
            backups.reload();
            schedules.reload();
          }}
          disabled={initial}
          className="px-2 py-1 text-sm"
        >
          Refresh backups
        </McButton>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <McButton
          onClick={() => void run(takeBackup)}
          disabled={busy || initial || backups.data === null || backups.data.setupRequired}
        >
          Back up now
        </McButton>
        <p className="text-muted text-sm">
          Worlds, player data, mods, and server files. Manual backups stay until deleted.
        </p>
      </div>
      {backups.data?.setupRequired && (
        <p className="text-highlight mb-4" role="status">
          Backup setup is needed. The server administrator must migrate the existing FTB backups
          while Minecraft is stopped.
        </p>
      )}

      {operation && (
        <div className="mc-inset mb-5 p-3" role="status" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <McBadge
              variant={
                operation.status === "succeeded"
                  ? "success"
                  : operation.status === "running"
                    ? "highlight"
                    : "danger"
              }
            >
              {operation.kind}
            </McBadge>
            <span>{operation.phase}</span>
          </div>
          {operation.error && <p className="text-danger mt-2 text-sm">{operation.error}</p>}
          {operation.safetyBackupId && (
            <p className="text-muted mt-2 text-sm">
              A safety backup preserves the state from before this restore.
            </p>
          )}
        </div>
      )}
      {submitted && !active && (
        <p role="status" className="mb-4">
          Request accepted. Loading progress…
        </p>
      )}

      <fieldset
        className="mb-6"
        disabled={busy || schedules.data === null || backups.data?.setupRequired}
      >
        <legend className="mb-2 font-bold">Scheduled backups</legend>
        <p className="text-muted mb-3 text-sm">
          Enable each schedule you want. Times use{" "}
          {schedules.data?.timezone ?? "the server timezone"}. Coinciding schedules share one
          snapshot.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((tier) => (
            <label key={tier} className="mc-inset flex flex-col gap-2 p-3 text-sm">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={schedules.data?.enabled[tier] ?? false}
                  onChange={(event) => {
                    const settings = schedules.data;
                    if (settings)
                      void run(async () => {
                        await updateBackupSchedules({
                          ...settings.enabled,
                          [tier]: event.target.checked,
                        });
                      });
                  }}
                />
                <span className="capitalize">{tier}</span>
              </span>
              <span className="text-muted">
                Keep {schedules.data?.retention[tier] ?? "—"} backups
              </span>
              <span>
                Next:{" "}
                {schedules.data?.nextRuns[tier]
                  ? new Date(schedules.data.nextRuns[tier]).toLocaleString(undefined, {
                      timeZone: schedules.data.timezone,
                    })
                  : "Off"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {preview && (
        <div className="mc-inset mb-5 p-4" role="region" aria-label="Restore confirmation">
          <h3 className="mb-2 font-bold">Restore {date(preview.backup.createdAt)}?</h3>
          <p className="mb-2">
            This replaces saved worlds, player progress, mods, and server configuration. A permanent
            safety backup will be created first.
          </p>
          <p className="mb-2 text-sm">Backup: {versionLabel(preview.backup.version)}</p>
          <p className="mb-2 text-sm">Current: {versionLabel(preview.currentVersion)}</p>
          <p className="mb-2">
            {preview.running
              ? `${preview.onlinePlayers ?? "Unknown number of"} players online. Minecraft will stop${preview.onlinePlayers ? " after a 30-second announcement" : ""} and restart after recovery.`
              : "Minecraft is stopped and will remain stopped after recovery."}
          </p>
          <p className="text-muted mb-3 text-sm">
            Recovery needs approximately {bytes(preview.requiredBytes)};{" "}
            {bytes(preview.availableBytes)} available.
          </p>
          {preview.reasons.length > 0 && (
            <ul className="text-danger mb-3 list-inside list-disc text-sm">
              {preview.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <McButton
              variant="danger"
              disabled={busy || !preview.canRestore}
              onClick={() => void run(confirmRestore)}
            >
              Confirm restore
            </McButton>
            <McButton disabled={pending} onClick={() => setPreview(null)}>
              Cancel
            </McButton>
          </div>
        </div>
      )}

      {initial && <LoadingText />}
      {backups.data?.backups.length === 0 && (
        <p className="text-muted">No backups yet. Create one now or enable a schedule.</p>
      )}
      <div className="grid gap-3">
        {backups.data?.backups.map((backup) => (
          <article key={backup.id} className="mc-inset p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <time dateTime={backup.createdAt}>{date(backup.createdAt)}</time>
              <McBadge variant="muted">{backup.origin}</McBadge>
              {backup.tiers.map((tier) => (
                <McBadge key={tier} variant="muted">
                  {tier}
                </McBadge>
              ))}
              <span className="text-muted text-sm">
                {bytes(backup.sizeBytes)} · {backup.fileCount} files
              </span>
            </div>
            <p className="text-muted mb-2 text-sm break-words">
              {versionLabel(backup.version)} ·{" "}
              {backup.contents === "full" ? "Full server data" : "World only"} ·{" "}
              {backup.method === "online"
                ? "Live backup"
                : backup.method === "offline"
                  ? "Offline backup"
                  : "Legacy archive"}
            </p>
            {!backup.compatibility.compatible && (
              <p className="text-highlight mb-2 text-sm">
                Restore unavailable: {backup.compatibility.reasons.join(" ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <McButton
                disabled={busy || !backup.compatibility.compatible}
                onClick={() => void run(() => showPreview(backup.id))}
              >
                Review restore
              </McButton>
              <McConfirmButton
                disabled={busy}
                confirmLabel="Delete permanently?"
                onConfirm={() =>
                  void run(async () => {
                    await deleteBackup(backup.id);
                    if (preview?.backup.id === backup.id) setPreview(null);
                  })
                }
              >
                Delete backup
              </McConfirmButton>
            </div>
          </article>
        ))}
      </div>
      <ErrorText error={actionError ?? backups.error ?? schedules.error} className="mt-4" />
      <p className="text-muted mt-4 text-sm">
        Backups are stored on the server’s disk. Live backups use Minecraft saving controls; some
        mods may write files independently.
      </p>
    </McPanel>
  );
}
