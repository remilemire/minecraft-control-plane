// apps/minecraft-controller/src/docker-log-stream.test.ts

import type { MinecraftConsoleLogEvent } from "@minecraft-control-plane/shared/minecraft";
import { PassThrough, type Readable, type Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createDockerLogEventStream } from "./docker-log-stream.js";

function demuxStdout(source: Readable): (stdout: Writable, stderr: Writable) => void {
  return (stdout) => {
    source.on("data", (chunk: Buffer) => {
      stdout.write(chunk);
    });
  };
}

async function collectEvents(
  events: AsyncIterable<MinecraftConsoleLogEvent>,
): Promise<MinecraftConsoleLogEvent[]> {
  const collected = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

async function waitForClose(source: Readable): Promise<void> {
  if (source.closed) {
    return;
  }
  await new Promise<void>((resolve) => {
    source.once("close", resolve);
  });
}

describe("createDockerLogEventStream", () => {
  it("preserves split UTF-8 characters and flushes a final unterminated line", async () => {
    const source = new PassThrough();
    const events = createDockerLogEventStream(
      source,
      new AbortController().signal,
      demuxStdout(source),
    );
    const collected = collectEvents(events);
    const content = Buffer.from("hello 👋");

    source.write(content.subarray(0, content.length - 2));
    source.end(content.subarray(content.length - 2));

    await expect(collected).resolves.toEqual([{ stream: "stdout", line: "hello 👋" }]);
  });

  it("pauses the Docker source when the event buffer fills and resumes it when consumed", async () => {
    const source = new PassThrough();
    const events = createDockerLogEventStream(
      source,
      new AbortController().signal,
      demuxStdout(source),
    );

    source.write(Buffer.from(Array.from({ length: 65 }, (_, index) => `line-${index}\n`).join("")));

    expect(source.isPaused()).toBe(true);

    const iterator = events[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(source.isPaused()).toBe(false);

    await iterator.return?.();
  });

  it("destroys the Docker source when the consumer stops iterating", async () => {
    const source = new PassThrough();
    const destroy = vi.spyOn(source, "destroy");
    const events = createDockerLogEventStream(
      source,
      new AbortController().signal,
      demuxStdout(source),
    );
    source.write("first\n");

    for await (const event of events) {
      expect(event).toEqual({ stream: "stdout", line: "first" });
      break;
    }

    await waitForClose(source);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys the Docker source and ends cleanly when aborted", async () => {
    const source = new PassThrough();
    const destroy = vi.spyOn(source, "destroy");
    const abortController = new AbortController();
    const events = createDockerLogEventStream(source, abortController.signal, demuxStdout(source));

    abortController.abort();

    await expect(collectEvents(events)).resolves.toEqual([]);
    await waitForClose(source);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys the Docker source and propagates source errors", async () => {
    const source = new PassThrough();
    const destroy = vi.spyOn(source, "destroy");
    const events = createDockerLogEventStream(
      source,
      new AbortController().signal,
      demuxStdout(source),
    );
    const failure = new Error("log stream failed");
    const next = events[Symbol.asyncIterator]().next();

    source.emit("error", failure);

    await expect(next).rejects.toThrow(failure);
    await waitForClose(source);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("does not adopt the Docker source when demux setup throws", () => {
    const source = new PassThrough();
    const failure = new Error("demux setup failed");

    expect(() =>
      createDockerLogEventStream(source, new AbortController().signal, () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(source.destroyed).toBe(false);

    source.destroy();
  });
});
