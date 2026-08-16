// apps/minecraft-controller/src/docker-log-stream.ts

import type { MinecraftConsoleLogEvent } from "@minecraft-control-plane/shared/minecraft";
import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

const MAX_BUFFERED_LOG_EVENTS = 64;

type DemuxDockerStream = (stdout: Writable, stderr: Writable) => void;

type SettlementReason =
  | { readonly kind: "source-ended" }
  | { readonly kind: "source-failed"; readonly error: Error }
  | { readonly kind: "aborted" }
  | {
      readonly kind: "consumer-destroyed";
      readonly error: Error | null;
      readonly callback: (error?: Error | null) => void;
    };

type LifecycleState = "open" | "settling" | "settled";

/**
 * Adopts a raw Docker log source and exposes structured, backpressured events.
 * If setup throws, ownership is not transferred and the caller must destroy
 * the source. After this function returns, destroying or ending the event
 * stream also destroys the source.
 */
export function createDockerLogEventStream(
  source: Readable,
  signal: AbortSignal,
  demux: DemuxDockerStream,
): Readable {
  let lifecycleState: LifecycleState = "open";
  let ownershipTransferred = false;
  let pendingSettlement: SettlementReason | undefined;
  let detachListeners = () => {};

  const output = new Readable({
    objectMode: true,
    highWaterMark: MAX_BUFFERED_LOG_EVENTS,
    read() {
      if (lifecycleState !== "settled") {
        source.resume();
      }
    },
    destroy(error, callback) {
      requestSettlement({ kind: "consumer-destroyed", error, callback });
    },
  });
  const emit = (event: MinecraftConsoleLogEvent) => {
    if (lifecycleState === "settled") {
      return;
    }
    if (!output.push(event)) {
      source.pause();
    }
  };
  const stdout = createLineSink("stdout", emit);
  const stderr = createLineSink("stderr", emit);

  const onSourceEnd = () => {
    requestSettlement({ kind: "source-ended" });
  };
  const onSourceError = (error: Error) => {
    requestSettlement({ kind: "source-failed", error });
  };
  const onAbort = () => {
    requestSettlement({ kind: "aborted" });
  };

  detachListeners = () => {
    signal.removeEventListener("abort", onAbort);
    source.off("end", onSourceEnd);
    source.off("close", onSourceEnd);
    source.off("error", onSourceError);
  };

  function requestSettlement(reason: SettlementReason): void {
    if (!ownershipTransferred) {
      pendingSettlement ??= reason;
      return;
    }
    settle(reason);
  }

  function settle(reason: SettlementReason): void {
    if (lifecycleState !== "open") {
      if (reason.kind === "consumer-destroyed") {
        reason.callback(reason.error);
      }
      return;
    }

    lifecycleState = "settling";
    detachListeners();

    if (reason.kind === "source-ended") {
      stdout.flush();
      stderr.flush();
    }

    if (!source.destroyed) {
      source.destroy();
    }
    lifecycleState = "settled";

    if (reason.kind === "consumer-destroyed") {
      reason.callback(reason.error);
    } else if (reason.kind === "source-failed") {
      output.destroy(reason.error);
    } else {
      output.push(null);
    }
  }

  signal.addEventListener("abort", onAbort, { once: true });
  source.once("end", onSourceEnd);
  source.once("close", onSourceEnd);
  source.once("error", onSourceError);

  try {
    demux(stdout.sink, stderr.sink);
  } catch (error) {
    // Setup did not complete, so the caller still owns the raw source.
    lifecycleState = "settled";
    detachListeners();
    throw error;
  }

  ownershipTransferred = true;
  if (signal.aborted) {
    pendingSettlement ??= { kind: "aborted" };
  }
  if (pendingSettlement !== undefined) {
    settle(pendingSettlement);
  }

  return output;
}

interface LineSink {
  readonly sink: Writable;
  flush(): void;
}

function createLineSink(
  stream: MinecraftConsoleLogEvent["stream"],
  emit: (event: MinecraftConsoleLogEvent) => void,
): LineSink {
  const decoder = new StringDecoder("utf8");
  let pending = "";

  const emitCompleteLines = () => {
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      emit({ stream, line });
    }
  };

  return {
    sink: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        pending += decoder.write(chunk);
        emitCompleteLines();
        callback();
      },
    }),
    flush() {
      pending += decoder.end();
      emitCompleteLines();
      if (pending !== "") {
        emit({ stream, line: pending });
        pending = "";
      }
    },
  };
}
