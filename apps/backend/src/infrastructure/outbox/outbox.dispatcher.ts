// apps/backend/src/infrastructure/outbox/outbox.dispatcher.ts

// The read side of the outbox: a poll loop that claims due messages and runs
// their handlers *outside* any transaction, after the enqueueing transaction
// committed.
//
// Ordering assumes a SINGLE dispatcher instance (one backend process): ticks
// are chained (never overlap) and each batch is processed sequentially in
// creation order, which is what gives FIFO delivery. Multiple instances stay
// *safe* — claims are serialized by FOR UPDATE SKIP LOCKED and outcomes are
// fenced by claimId — but would interleave without ordering. Even then (or
// after a claim expires mid-handler and is retried), handlers must be
// idempotent and converge to current database state; see OutboxHandler.
import type { OutboxMessageRepository } from "./outbox.repository.js";
import type { OutboxMessage } from "./outbox.schema.js";
import type { OutboxHandler, OutboxMessageDefinitionMap } from "./outbox.types.js";

export const OUTBOX_DISPATCHER_DEFAULTS = {
  pollIntervalMs: 1_000,
  batchSize: 10,
  maxAttempts: 10,
  // Must comfortably exceed a handler's worst case (RCON commands time out
  // after 5s) so a live worker's claim can't expire under it.
  claimTtlMs: 30_000,
  backoffBaseMs: 5_000,
  backoffCapMs: 900_000,
} as const;

export type OutboxDispatcherOptions = Partial<typeof OUTBOX_DISPATCHER_DEFAULTS>;

export type OutboxHandlerRegistry = ReadonlyMap<string, OutboxHandler>;

// Boot-time cross-check of handlers against the aggregated definitions, so a
// missing or duplicate handler fails startup instead of dead-lettering
// messages at runtime.
export function createOutboxHandlerRegistry(
  definitions: OutboxMessageDefinitionMap,
  handlers: readonly OutboxHandler[],
): OutboxHandlerRegistry {
  const registry = new Map<string, OutboxHandler>();

  for (const handler of handlers) {
    const { type } = handler.message;

    if (registry.has(type)) {
      throw new Error(`Duplicate outbox handler for message type "${type}".`);
    }
    if (!(type in definitions)) {
      throw new Error(`Outbox handler for unknown message type "${type}".`);
    }

    registry.set(type, handler);
  }

  for (const type of Object.keys(definitions)) {
    if (!registry.has(type)) {
      throw new Error(`No outbox handler registered for message type "${type}".`);
    }
  }

  return registry;
}

export class OutboxDispatcher {
  private readonly options: typeof OUTBOX_DISPATCHER_DEFAULTS;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private activeTick: Promise<void> | undefined;

  public constructor(
    private readonly outboxMessages: OutboxMessageRepository,
    private readonly handlers: OutboxHandlerRegistry,
    options: OutboxDispatcherOptions = {},
  ) {
    this.options = { ...OUTBOX_DISPATCHER_DEFAULTS, ...options };
  }

  // Production only (server.ts). Tests drive tick() directly instead.
  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleNext();
  }

  public async stop(): Promise<void> {
    this.running = false;

    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    await this.activeTick;
  }

  // One deterministic poll: claim a batch and process it sequentially in
  // creation order. Returns how many messages were claimed.
  public async tick(): Promise<number> {
    const now = new Date();

    const claimed = await this.outboxMessages.claimBatch({
      now,
      claimUntil: new Date(now.getTime() + this.options.claimTtlMs),
      limit: this.options.batchSize,
      maxAttempts: this.options.maxAttempts,
    });

    for (const message of claimed) {
      await this.process(message);
    }

    return claimed.length;
  }

  private async process(message: OutboxMessage): Promise<void> {
    // A freshly claimed row always carries the claim's fencing token.
    const claimId = message.claimId ?? "";

    try {
      const handler = this.handlers.get(message.type);

      if (handler === undefined) {
        throw new Error(`No outbox handler registered for message type "${message.type}".`);
      }

      // Re-parse what was actually stored — the payload crossed a jsonb
      // round-trip and possibly a deploy since it was enqueued.
      const payload = handler.message.payloadSchema.parse(message.payload);
      await handler.handle(payload);
    } catch (error) {
      await this.recordFailure(message, claimId, error);
      return;
    }

    const completed = await this.outboxMessages.markCompleted({
      id: message.id,
      claimId,
      completedAt: new Date(),
    });

    if (!completed) {
      console.warn(
        `Outbox message ${message.id} (type "${message.type}") was re-claimed before its completion was recorded; skipping.`,
      );
    }
  }

  private async recordFailure(
    message: OutboxMessage,
    claimId: string,
    error: unknown,
  ): Promise<void> {
    const lastError = error instanceof Error ? (error.stack ?? error.message) : String(error);
    // `message.attempts` already includes this attempt (incremented at claim).
    const backoffMs = Math.min(
      this.options.backoffBaseMs * 2 ** (message.attempts - 1),
      this.options.backoffCapMs,
    );

    const marked = await this.outboxMessages.markFailed({
      id: message.id,
      claimId,
      nextAttemptAt: new Date(Date.now() + backoffMs),
      lastError,
    });

    if (!marked) {
      console.warn(
        `Outbox message ${message.id} (type "${message.type}") was re-claimed before its failure was recorded; skipping.`,
      );
      return;
    }

    if (message.attempts >= this.options.maxAttempts) {
      console.error(
        `Outbox message ${message.id} (type "${message.type}") dead-lettered after ${String(
          message.attempts,
        )} attempts: ${lastError}`,
      );
    }
  }

  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.activeTick = this.runScheduledTick();
    }, this.options.pollIntervalMs);
  }

  private async runScheduledTick(): Promise<void> {
    try {
      await this.tick();
    } catch (error) {
      // A down database must not crash the process; the next tick retries.
      console.error("Outbox dispatcher tick failed:", error);
    } finally {
      this.activeTick = undefined;

      if (this.running) {
        this.scheduleNext();
      }
    }
  }
}
