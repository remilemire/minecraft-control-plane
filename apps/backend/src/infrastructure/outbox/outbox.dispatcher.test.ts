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

// A recording repository whose claimBatch pops one batch per tick.
function recordingRepository(batches: OutboxMessage[][]) {
  const claims: ClaimBatchInput[] = [];
  const completions: MarkCompletedInput[] = [];
  const failures: MarkFailedInput[] = [];

  const repository = repositoryStub({
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

  return { repository, claims, completions, failures };
}

function handlerFor<TDefinition extends OutboxHandler["message"]>(
  definition: TDefinition,
  handle: (payload: unknown) => Promise<void> = async () => {},
): OutboxHandler {
  return { message: definition, handle } as OutboxHandler;
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
      const { repository, claims, completions } = recordingRepository([[first, second]]);

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

    it("logs loudly when a message dead-letters on its final attempt", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const lastTry = message({ attempts: OUTBOX_DISPATCHER_DEFAULTS.maxAttempts });
      const { repository } = recordingRepository([[lastTry]]);

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

      expect(error).toHaveBeenCalledWith(expect.stringContaining("dead-lettered"));
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
