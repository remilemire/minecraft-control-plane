// apps/frontend/src/features/minecraft/server/console/api.ts

import { API_BASE, apiRequest } from "@/lib/apiClient";
import {
  minecraftConsoleCommandSchema,
  minecraftConsoleLogEventSchema,
  type MinecraftConsoleLogEvent,
} from "@minecraft-control-plane/shared/minecraft";

export type { MinecraftConsoleLogEvent };

export function sendConsoleCommand(command: string): Promise<undefined> {
  return apiRequest("POST", "/minecraft/server/console/commands", {
    body: minecraftConsoleCommandSchema.parse({ command }),
  });
}

export interface ConsoleLogStreamHandlers {
  onLog: (event: MinecraftConsoleLogEvent) => void;
  /** The stream is connected — fires on the first connect and on every automatic reconnect. */
  onOpen: () => void;
  /** The connection dropped; the browser keeps retrying (fires once per failed attempt). */
  onReconnecting: () => void;
  /** The browser gave up (e.g. the endpoint answered an error) — no more retries. */
  onClosed: () => void;
}

/**
 * Follows the server console over SSE. Returns a closer; after a drop the
 * browser reconnects on its own, and the backend replays a tail of recent
 * lines on each connect — callers own marking that seam (no deduplication).
 */
export function openConsoleLogStream(handlers: ConsoleLogStreamHandlers): () => void {
  const source = new EventSource(`${API_BASE}/minecraft/server/console/logs`);

  source.addEventListener("open", () => {
    handlers.onOpen();
  });

  source.addEventListener("log", (event) => {
    const parsed = minecraftConsoleLogEventSchema.safeParse(
      parseJson((event as MessageEvent<string>).data),
    );
    if (parsed.success) {
      handlers.onLog(parsed.data);
    }
  });

  source.addEventListener("error", () => {
    if (source.readyState === EventSource.CLOSED) {
      handlers.onClosed();
    } else {
      handlers.onReconnecting();
    }
  });

  return () => {
    source.close();
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
