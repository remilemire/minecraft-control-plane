// apps/frontend/src/features/minecraft/server/console/ConsolePanel.tsx

import { ErrorText } from "@/components/ErrorText";
import { McBadge } from "@/components/McBadge";
import { McButton } from "@/components/McButton";
import { McInput } from "@/components/McInput";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { minecraftConsoleCommandSchema } from "@minecraft-control-plane/shared/minecraft";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { openConsoleLogStream, sendConsoleCommand, type MinecraftConsoleLogEvent } from "./api";

// Every connect replays a tail of recent lines, so scrollback older than a few
// screens only grows memory — cap the buffer instead of keeping it all.
const MAX_ENTRIES = 500;

type ConnectionStatus = "connecting" | "live" | "reconnecting" | "disconnected";

const CONNECTION_BADGES = {
  connecting: { label: "Connecting...", variant: "muted" },
  live: { label: "Live", variant: "success" },
  reconnecting: { label: "Reconnecting...", variant: "highlight" },
  disconnected: { label: "Disconnected", variant: "danger" },
} as const satisfies Record<
  ConnectionStatus,
  { label: string; variant: "success" | "danger" | "highlight" | "muted" }
>;

type ConsoleEntryInput =
  | { kind: "log"; stream: MinecraftConsoleLogEvent["stream"]; line: string }
  | { kind: "command"; command: string }
  | { kind: "notice"; text: string };

type ConsoleEntry = ConsoleEntryInput & { id: number };

function ConsoleLine({ entry }: { entry: ConsoleEntry }) {
  if (entry.kind === "notice") {
    return <p className="text-muted">— {entry.text} —</p>;
  }
  if (entry.kind === "command") {
    return <p className="text-highlight">&gt; {entry.command}</p>;
  }
  return (
    <p
      className={`break-all whitespace-pre-wrap ${entry.stream === "stderr" ? "text-danger" : ""}`}
    >
      {entry.line}
    </p>
  );
}

export function ConsolePanel() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [streamEpoch, setStreamEpoch] = useState(0);
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);
  const [commandError, setCommandError] = useState<ApiError | null>(null);

  const nextIdRef = useRef(0);
  // Whether the current / any previous connection was open — drives the
  // "lost"/"reconnected" seam notices and survives a manual reconnect.
  const liveRef = useRef(false);
  const everLiveRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const append = useCallback((entry: ConsoleEntryInput) => {
    setEntries((previous) => {
      const next = [...previous, { ...entry, id: nextIdRef.current++ }];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  useEffect(() => {
    setConnection(everLiveRef.current ? "reconnecting" : "connecting");

    return openConsoleLogStream({
      onLog: (event) => {
        append({ kind: "log", stream: event.stream, line: event.line });
      },
      onOpen: () => {
        // Every connect after the first replays recent lines — mark the seam,
        // since nothing upstream deduplicates them.
        if (everLiveRef.current) {
          append({ kind: "notice", text: "Reconnected — recent lines may repeat" });
        }
        liveRef.current = true;
        everLiveRef.current = true;
        setConnection("live");
      },
      onReconnecting: () => {
        // Fires again on every failed retry — only the drop itself gets a notice.
        if (liveRef.current) {
          liveRef.current = false;
          append({ kind: "notice", text: "Connection lost — reconnecting" });
        }
        setConnection(everLiveRef.current ? "reconnecting" : "connecting");
      },
      onClosed: () => {
        liveRef.current = false;
        append({ kind: "notice", text: "Log stream disconnected" });
        setConnection("disconnected");
      },
    });
  }, [append, streamEpoch]);

  // Follow the newest line unless the user has scrolled up to read history.
  useEffect(() => {
    const view = scrollRef.current;
    if (view !== null && stickToBottomRef.current) {
      view.scrollTop = view.scrollHeight;
    }
  }, [entries]);

  function handleScroll() {
    const view = scrollRef.current;
    if (view !== null) {
      stickToBottomRef.current = view.scrollHeight - view.scrollTop - view.clientHeight < 16;
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsed = minecraftConsoleCommandSchema.safeParse({ command });
    if (!parsed.success) {
      return;
    }

    setSending(true);
    setCommandError(null);
    // Echo before the round trip: the server's log lines for this command race
    // in over the SSE channel and would otherwise land above the echo.
    append({ kind: "command", command: parsed.data.command });
    try {
      await sendConsoleCommand(parsed.data.command);
      setCommand("");
    } catch (submitError) {
      setCommandError(toApiError(submitError));
    } finally {
      setSending(false);
    }
  }

  const badge = CONNECTION_BADGES[connection];

  return (
    <McPanel title="Console">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-muted">Stream:</span>
        <McBadge variant={badge.variant}>{badge.label}</McBadge>
        {connection === "disconnected" && (
          <McButton
            onClick={() => setStreamEpoch((epoch) => epoch + 1)}
            className="ml-auto px-2 py-1 text-sm"
          >
            Reconnect
          </McButton>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Server logs"
        className="mc-inset bg-console text-console-text h-80 overflow-y-auto p-3 text-sm [text-shadow:none]"
      >
        {entries.length === 0 && <p className="text-muted">No console output yet.</p>}
        {entries.map((entry) => (
          <ConsoleLine key={entry.id} entry={entry} />
        ))}
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="mt-4 flex gap-2">
          <label htmlFor="console-command" className="sr-only">
            Console command
          </label>
          <McInput
            id="console-command"
            name="command"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="say Hello world"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1"
          />
          <McButton type="submit" disabled={sending || command.trim() === ""}>
            {sending ? "Sending..." : "Send"}
          </McButton>
        </div>
        <ErrorText error={commandError} className="mt-2 text-sm" />
      </form>
    </McPanel>
  );
}
