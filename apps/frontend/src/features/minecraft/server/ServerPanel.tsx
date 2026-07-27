// apps/frontend/src/features/minecraft/server/ServerPanel.tsx

import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { McBadge } from "@/components/McBadge";
import { McButton } from "@/components/McButton";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { useRequest } from "@/lib/useRequest";
import { useEffect, useState } from "react";
import { fetchServerStatus, restartServer, startServer, stopServer } from "./api";

type ServerAction = "start" | "stop" | "restart";

// The container's state changes without us — a crash, a `docker stop` on the
// host, or a Start that only finishes booting after the call returns — so the
// status is polled rather than trusted until the next action.
const STATUS_POLL_MS = 10_000;

export function ServerPanel() {
  const { data: status, error, loading, reload } = useRequest(fetchServerStatus);
  const [pending, setPending] = useState<ServerAction | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  useEffect(() => {
    const timer = setInterval(reload, STATUS_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [reload]);

  async function run(action: ServerAction, request: () => Promise<undefined>) {
    setPending(action);
    setActionError(null);
    try {
      await request();
      reload();
    } catch (requestError) {
      setActionError(toApiError(requestError));
    } finally {
      setPending(null);
    }
  }

  // A poll is not something the user is waiting on: only the first load may
  // blank the badge or disable the controls.
  const initialLoad = loading && status === null;
  const busy = pending !== null || initialLoad;
  const running = status === "RUNNING";

  return (
    <McPanel title="Server">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-muted">Status:</span>
        {initialLoad ? (
          <LoadingText />
        ) : status !== null ? (
          <McBadge variant={running ? "success" : "danger"}>{status}</McBadge>
        ) : (
          <McBadge variant="muted">Unknown</McBadge>
        )}
        <McButton onClick={reload} disabled={busy} className="ml-auto px-2 py-1 text-sm">
          Refresh
        </McButton>
      </div>

      <div className="flex flex-wrap gap-2">
        <McButton onClick={() => void run("start", startServer)} disabled={busy || running}>
          {pending === "start" ? "Starting..." : "Start"}
        </McButton>
        <McButton onClick={() => void run("stop", stopServer)} disabled={busy || !running}>
          {pending === "stop" ? "Stopping..." : "Stop"}
        </McButton>
        <McButton onClick={() => void run("restart", restartServer)} disabled={busy || !running}>
          {pending === "restart" ? "Restarting..." : "Restart"}
        </McButton>
      </div>

      <ErrorText error={error ?? actionError} className="mt-4" />
    </McPanel>
  );
}
