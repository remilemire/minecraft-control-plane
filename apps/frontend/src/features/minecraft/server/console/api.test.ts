// apps/frontend/src/features/minecraft/server/console/api.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openConsoleLogStream, type ConsoleLogStreamHandlers } from "./api";

class FakeEventSource {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSED = 2;
  public static instances: FakeEventSource[] = [];

  public readonly url: string;
  public readyState: number = FakeEventSource.CONNECTING;
  public closed = false;
  private readonly listeners = new Map<string, EventListener[]>();

  public constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  public addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  public close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  public emit(event: Event): void {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

function makeHandlers(): ConsoleLogStreamHandlers {
  return {
    onLog: vi.fn(),
    onOpen: vi.fn(),
    onReconnecting: vi.fn(),
    onClosed: vi.fn(),
  };
}

function lastSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (source === undefined) throw new Error("No EventSource was opened.");
  return source;
}

describe("openConsoleLogStream", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows the console logs endpoint and forwards parsed log events", () => {
    const handlers = makeHandlers();
    openConsoleLogStream(handlers);

    const source = lastSource();
    expect(source.url).toBe("/api/minecraft/server/console/logs");

    source.emit(new Event("open"));
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);

    source.emit(
      new MessageEvent("log", { data: JSON.stringify({ stream: "stderr", line: "A warning" }) }),
    );
    expect(handlers.onLog).toHaveBeenCalledWith({ stream: "stderr", line: "A warning" });
  });

  it("drops frames that are not valid log events", () => {
    const handlers = makeHandlers();
    openConsoleLogStream(handlers);

    const source = lastSource();
    source.emit(new MessageEvent("log", { data: "not json" }));
    source.emit(new MessageEvent("log", { data: JSON.stringify({ stream: "tty", line: "x" }) }));

    expect(handlers.onLog).not.toHaveBeenCalled();
  });

  it("reports a retrying drop as reconnecting and a final one as closed", () => {
    const handlers = makeHandlers();
    openConsoleLogStream(handlers);

    const source = lastSource();
    source.readyState = FakeEventSource.CONNECTING;
    source.emit(new Event("error"));
    expect(handlers.onReconnecting).toHaveBeenCalledTimes(1);
    expect(handlers.onClosed).not.toHaveBeenCalled();

    source.readyState = FakeEventSource.CLOSED;
    source.emit(new Event("error"));
    expect(handlers.onClosed).toHaveBeenCalledTimes(1);
  });

  it("closes the underlying source through the returned closer", () => {
    const close = openConsoleLogStream(makeHandlers());

    close();

    expect(lastSource().closed).toBe(true);
  });
});
