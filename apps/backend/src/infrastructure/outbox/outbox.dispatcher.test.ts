// apps/backend/src/infrastructure/outbox/outbox.dispatcher.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createOutboxHandlerRegistry,
  OUTBOX_DISPATCHER_DEFAULTS,
  OutboxDispatcher,
} from "./outbox.dispatcher.js";
import type {
  ClaimBatchInput,
  MarkAbandonedDeadInput,
  MarkCompletedInput,
  MarkFailedInput,
  OutboxMessageRepository,
} from "./outbox.repository.js";
import type { OutboxMessage } from "./outbox.schema.js";
import { defineOutboxMessage, type OutboxHandler } from "./outbox.types.js";

const NOW = new Date("2026-07-24T12:00:00Z");

const alphaMessage = defineOutboxMessage({
  type: "test.alpha",
  payloadSchema: z.strictObject({ value: z.number() }),
});
const betaMessage = defineOutboxMessage({
  type: "test.beta",
  payloadSchema: z.strictObject({}),
});

const definitions = {
  [alphaMessage.type]: alphaMessage,
  [betaMessage.type]: betaMessage,
} as const;

function message(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
  return {
    id: "00000000-0000-0000-0000-0000000000aa",
    type: "test.alpha",
    payload: { value: 1 },
    status: "processing",
    attempts: 1,
    nextAttemptAt: NOW,
    claimId: "00000000-0000-0000-0000-0000000000cc",
    claimExpiresAt: new Date(NOW.getTime() + 30_000),
    lastError: null,
    createdAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

// The repository is a class (nominal because of its private provider field),
// so method-level stubs need the double cast.
function repositoryStub(
  methods: Partial<Record<keyof OutboxMessageRepository, unknown>>,
): OutboxMessageRepository {
  return methods as unknown as OutboxMessageRepository;
}

// A recording repository whose claimBatch pops one batch per tick. The first
// reap returns `abandoned` (rows a dead worker left behind), later ones none.
function recordingRepository(batches: OutboxMessage[][], abandoned: OutboxMessage[] = []) {
  const claims: ClaimBatchInput[] = [];
  const reaps: MarkAbandonedDeadInput[] = [];
  const completions: MarkCompletedInput[] = [];
  const failures: MarkFailedInput[] = [];

  const repository = repositoryStub({
    markAbandonedDead: async (input: MarkAbandonedDeadInput) => {
      reaps.push(input);
      return reaps.length === 1 ? abandoned : [];
    },
    claimBatch: async (input: ClaimBatchInput) => {
      claims.push(input);
      return batches.shift() ?? [];
    },
    markCompleted: async (input: MarkCompletedInput) => {
      completions.push(input);
      return true;
    },
    markFailed: async (input: MarkFailedInput) => {
      failures.push(input);
      return true;
    },
  });

  return { repository, claims, reaps, completions, failures };
}

function handlerFor<TDefinition extends OutboxHandler["message"]>(
  definition: TDefinition,
  handle: (payload: unknown) => Promise<void> = async () => {},
  onDeadLetter?: (payload: unknown, error: unknown) => Promise<void>,
): OutboxHandler {
  return { message: definition, handle, onDeadLetter } as OutboxHandler;
}

describe("createOutboxHandlerRegistry", () => {
  it("indexes handlers by their message type", () => {
    const alpha = handlerFor(alphaMessage);
    const beta = handlerFor(betaMessage);

    const registry = createOutboxHandlerRegistry(definitions, [alpha, beta]);

    expect(registry.get("test.alpha")).toBe(alpha);
    expect(registry.get("test.beta")).toBe(beta);
  });

  it("throws on a duplicate handler", () => {
    expect(() =>
      createOutboxHandlerRegistry(definitions, [
        handlerFor(alphaMessage),
        handlerFor(alphaMessage),
        handlerFor(betaMessage),
      ]),
    ).toThrow('Duplicate outbox handler for message type "test.alpha".');
  });

  it("throws on a handler whose type has no definition", () => {
    const orphanMessage = defineOutboxMessage({
      type: "test.orphan",
      payloadSchema: z.strictObject({}),
    });

    expect(() =>
      createOutboxHandlerRegistry(definitions, [
        handlerFor(alphaMessage),
        handlerFor(betaMessage),
        handlerFor(orphanMessage),
      ]),
    ).toThrow('Outbox handler for unknown message type "test.orphan".');
  });

  it("throws on a definition with no handler", () => {
    expect(() => createOutboxHandlerRegistry(definitions, [handlerFor(alphaMessage)])).toThrow(
      'No outbox handler registered for message type "test.beta".',
    );
  });
});

describe("OutboxDispatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function registryWith(handlers: OutboxHandler[]) {
    return createOutboxHandlerRegistry(definitions, handlers);
  }

  describe("tick", () => {
    it("claims with the configured window and processes in order", async () => {
      const handled: unknown[] = [];
      const first = message({ id: "00000000-0000-0000-0000-000000000001", payload: { value: 1 } });
      const second = message({ id: "00000000-0000-0000-0000-000000000002", payload: { value: 2 } });
      const { repository, claims, reaps, completions } = recordingRepository([[first, second]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(alphaMessage, async (payload) => {
            handled.push(payload);
          }),
          handlerFor(betaMessage),
        ]),
      );

      expect(await dispatcher.tick()).toBe(2);

      expect(claims).toEqual([
        {
          now: NOW,
          claimUntil: new Date(NOW.getTime() + OUTBOX_DISPATCHER_DEFAULTS.claimTtlMs),
          limit: OUTBOX_DISPATCHER_DEFAULTS.batchSize,
          maxAttempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts,
        },
      ]);
      // Abandoned claims are buried on the same clock, before anything is
      // claimed.
      expect(reaps).toEqual([{ now: NOW, maxAttempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts }]);
      expect(handled).toEqual([{ value: 1 }, { value: 2 }]);
      expect(completions).toEqual([
        { id: first.id, claimId: first.claimId, completedAt: NOW },
        { id: second.id, claimId: second.claimId, completedAt: NOW },
      ]);
    });

    it("returns 0 and marks nothing on an empty claim", async () => {
      const { repository, completions, failures } = recordingRepository([]);
      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([handlerFor(alphaMessage), handlerFor(betaMessage)]),
      );

      expect(await dispatcher.tick()).toBe(0);
      expect(completions).toEqual([]);
      expect(failures).toEqual([]);
    });

    it("marks a throwing handler failed with exponential backoff", async () => {
      const failing = message({ attempts: 3 });
      const { repository, completions, failures } = recordingRepository([[failing]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(alphaMessage, async () => {
            throw new Error("RCON exploded");
          }),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(completions).toEqual([]);
      expect(failures).toHaveLength(1);
      // attempts = 3 (post-claim) -> 5s * 2^2 = 20s.
      expect(failures[0]).toMatchObject({
        id: failing.id,
        claimId: failing.claimId,
        status: "pending",
        nextAttemptAt: new Date(NOW.getTime() + 20_000),
      });
      expect(failures[0]?.lastError).toContain("RCON exploded");
    });

    it("caps the backoff", async () => {
      const failing = message({ attempts: 9 });
      const { repository, failures } = recordingRepository([[failing]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(alphaMessage, async () => {
            throw new Error("still down");
          }),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      // 5s * 2^8 = 1280s, capped at 900s.
      expect(failures[0]?.nextAttemptAt).toEqual(
        new Date(NOW.getTime() + OUTBOX_DISPATCHER_DEFAULTS.backoffCapMs),
      );
    });

    it("fails a message whose type has no handler instead of crashing", async () => {
      const unknown = message({ type: "test.unknown" });
      const { repository, failures } = recordingRepository([[unknown]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([handlerFor(alphaMessage), handlerFor(betaMessage)]),
      );

      await dispatcher.tick();

      expect(failures[0]?.lastError).toContain(
        'No outbox handler registered for message type "test.unknown".',
      );
    });

    it("fails a message whose stored payload no longer parses", async () => {
      const corrupt = message({ payload: { value: "not-a-number" } });
      const handled: unknown[] = [];
      const { repository, failures } = recordingRepository([[corrupt]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(alphaMessage, async (payload) => {
            handled.push(payload);
          }),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(handled).toEqual([]);
      expect(failures).toHaveLength(1);
    });

    it("marks a message dead and logs loudly on its final attempt", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const lastTry = message({ attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts });
      const { repository, failures } = recordingRepository([[lastTry]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(alphaMessage, async () => {
            throw new Error("terminal");
          }),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(failures[0]).toMatchObject({ id: lastTry.id, status: "dead" });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("dead-lettered"));
    });

    it("calls the handler's onDeadLetter with the payload and the error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const buried: { payload: unknown; error: unknown }[] = [];
      const lastTry = message({
        attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts,
        payload: { value: 7 },
      });
      const { repository } = recordingRepository([[lastTry]]);
      const failure = new Error("terminal");

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {
              throw failure;
            },
            async (payload, error) => {
              buried.push({ payload, error });
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(buried).toEqual([{ payload: { value: 7 }, error: failure }]);
    });

    it("leaves onDeadLetter alone while attempts remain", async () => {
      const buried: unknown[] = [];
      const retrying = message({ attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts - 1 });
      const { repository, failures } = recordingRepository([[retrying]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {
              throw new Error("not yet terminal");
            },
            async (payload) => {
              buried.push(payload);
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(failures[0]).toMatchObject({ status: "pending" });
      expect(buried).toEqual([]);
    });

    it("skips onDeadLetter when the stored payload never parsed", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const buried: unknown[] = [];
      const corrupt = message({
        attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts,
        payload: { value: "not-a-number" },
      });
      const { repository, failures } = recordingRepository([[corrupt]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {},
            async (payload) => {
              buried.push(payload);
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(failures[0]).toMatchObject({ status: "dead" });
      expect(buried).toEqual([]);
    });

    it("keeps the dead status when onDeadLetter itself throws", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const lastTry = message({ attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts });
      const { repository, failures } = recordingRepository([[lastTry]]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {
              throw new Error("terminal");
            },
            async () => {
              throw new Error("hook exploded");
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await expect(dispatcher.tick()).resolves.toBe(1);

      expect(failures[0]).toMatchObject({ status: "dead" });
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("onDeadLetter"),
        expect.any(Error),
      );
    });

    it("skips the dead-letter path when the failure was never recorded", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const buried: unknown[] = [];
      const stale = message({ attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts });
      const { repository } = recordingRepository([[stale]]);
      (repository as { markFailed: unknown }).markFailed = async () => false;

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {
              throw new Error("terminal");
            },
            async (payload) => {
              buried.push(payload);
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("re-claimed"));
      expect(error).not.toHaveBeenCalled();
      expect(buried).toEqual([]);
    });

    it("drops a superseded claim without completing it", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const stale = message();
      const { repository, failures } = recordingRepository([[stale]]);
      (repository as { markCompleted: unknown }).markCompleted = async () => false;

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([handlerFor(alphaMessage), handlerFor(betaMessage)]),
      );

      await dispatcher.tick();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("re-claimed"));
      expect(failures).toEqual([]);
    });
  });

  // A worker that dies mid-attempt records no outcome at all: its row stays
  // `processing` with a claim that simply stops being renewed. What happens
  // next depends only on whether it had attempts left.
  describe("a worker that died mid-attempt", () => {
    // What claimBatch hands back after the dead worker's claim expired: still
    // `processing`, attempts already spent, no outcome recorded.
    function abandonedMessage(overrides: Partial<OutboxMessage> = {}): OutboxMessage {
      return message({
        status: "processing",
        attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts,
        claimExpiresAt: new Date(NOW.getTime() - 1_000),
        lastError: null,
        ...overrides,
      });
    }

    it("retries it while attempts remain, without dead-lettering", async () => {
      const handled: unknown[] = [];
      // The reaper leaves it alone (attempts remain), so the next claim picks
      // it up again — the same message, one attempt further along.
      const retryable = message({
        status: "processing",
        attempts: 4,
        claimExpiresAt: new Date(NOW.getTime() - 1_000),
        lastError: "worker vanished",
      });
      const { repository, completions } = recordingRepository([[retryable]]);
      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(alphaMessage, async (payload) => {
            handled.push(payload);
          }),
          handlerFor(betaMessage),
        ]),
      );

      expect(await dispatcher.tick()).toBe(1);

      expect(handled).toEqual([{ value: 1 }]);
      expect(completions).toHaveLength(1);
    });

    it("buries the row and calls onDeadLetter once its attempts are spent", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const buried: { payload: unknown; error: unknown }[] = [];
      const abandoned = abandonedMessage({ payload: { value: 3 } });
      const { repository, failures } = recordingRepository([], [abandoned]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {},
            async (payload, hookError) => {
              buried.push({ payload, error: hookError });
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      // Nothing was claimed — the message is only reaped.
      expect(await dispatcher.tick()).toBe(0);

      expect(buried).toHaveLength(1);
      expect(buried[0]?.payload).toEqual({ value: 3 });
      expect(error).toHaveBeenCalledWith(expect.stringContaining("dead-lettered"));
      // The row was already buried by the reaper's UPDATE; no outcome is
      // recorded against a claim whose worker is gone.
      expect(failures).toEqual([]);
    });

    it("tells the hook the message was abandoned, carrying the last error it recorded", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const errors: unknown[] = [];
      const abandoned = abandonedMessage({ lastError: "RCON timed out" });
      const { repository } = recordingRepository([], [abandoned]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {},
            async (_payload, hookError) => {
              errors.push(hookError);
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toContain("abandoned mid-attempt");
      expect((errors[0] as Error).message).toContain("RCON timed out");
    });

    it("buries what it abandoned before claiming anything new", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const order: string[] = [];
      const abandoned = abandonedMessage({ id: "00000000-0000-0000-0000-00000000000a" });
      const next = message({ id: "00000000-0000-0000-0000-00000000000b" });
      const { repository } = recordingRepository([[next]], [abandoned]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {
              order.push("handled");
            },
            async () => {
              order.push("dead-lettered");
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(order).toEqual(["dead-lettered", "handled"]);
      expect(error).toHaveBeenCalledTimes(1);
    });

    it("keeps polling when the hook for an abandoned message throws", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { repository, reaps } = recordingRepository([], [abandonedMessage()]);

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {},
            async () => {
              throw new Error("hook exploded");
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      dispatcher.start();
      await vi.advanceTimersByTimeAsync(OUTBOX_DISPATCHER_DEFAULTS.pollIntervalMs * 2);
      await dispatcher.stop();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("onDeadLetter"),
        expect.any(Error),
      );
      // The throw stayed inside the tick: the loop kept its cadence.
      expect(reaps).toHaveLength(2);
    });

    it("skips the hook when its stored payload no longer parses", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const buried: unknown[] = [];
      const { repository } = recordingRepository(
        [],
        [abandonedMessage({ payload: { value: "not-a-number" } })],
      );

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([
          handlerFor(
            alphaMessage,
            async () => {},
            async (payload) => {
              buried.push(payload);
            },
          ),
          handlerFor(betaMessage),
        ]),
      );

      await dispatcher.tick();

      expect(buried).toEqual([]);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("no longer parses"));
    });
  });

  describe("start/stop", () => {
    it("polls on the interval and stops cleanly", async () => {
      const { repository, claims } = recordingRepository([]);
      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([handlerFor(alphaMessage), handlerFor(betaMessage)]),
      );

      dispatcher.start();
      expect(claims).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(OUTBOX_DISPATCHER_DEFAULTS.pollIntervalMs);
      expect(claims).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(OUTBOX_DISPATCHER_DEFAULTS.pollIntervalMs);
      expect(claims).toHaveLength(2);

      await dispatcher.stop();
      await vi.advanceTimersByTimeAsync(OUTBOX_DISPATCHER_DEFAULTS.pollIntervalMs * 5);
      expect(claims).toHaveLength(2);
    });

    it("keeps polling after a failed tick", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const claims: ClaimBatchInput[] = [];
      const repository = repositoryStub({
        markAbandonedDead: async () => [],
        claimBatch: async (input: ClaimBatchInput) => {
          claims.push(input);
          if (claims.length === 1) {
            throw new Error("database is down");
          }
          return [];
        },
      });

      const dispatcher = new OutboxDispatcher(
        repository,
        registryWith([handlerFor(alphaMessage), handlerFor(betaMessage)]),
      );

      dispatcher.start();
      await vi.advanceTimersByTimeAsync(OUTBOX_DISPATCHER_DEFAULTS.pollIntervalMs);
      expect(error).toHaveBeenCalledWith("Outbox dispatcher tick failed:", expect.any(Error));

      await vi.advanceTimersByTimeAsync(OUTBOX_DISPATCHER_DEFAULTS.pollIntervalMs);
      expect(claims).toHaveLength(2);

      await dispatcher.stop();
    });
  });
});
