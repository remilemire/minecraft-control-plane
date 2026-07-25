// apps/backend/src/infrastructure/outbox/outbox.types.ts

// The outbox's contracts. This module (and the whole outbox infrastructure)
// knows nothing about concrete message types — features declare their own
// messages and handlers in `<feature>.outbox.ts` files, and
// `outbox.registry.ts` aggregates the definitions the way `db/schemas.ts`
// aggregates tables.
import type { z } from "zod";

export interface OutboxMessageDefinition<
  TType extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: TType;
  readonly payloadSchema: z.ZodType<TPayload>;
}

// Identity helper that keeps the literal `type` and the payload type inferred
// from the schema paired together.
export function defineOutboxMessage<
  const TType extends string,
  TPayload extends Record<string, unknown>,
>(definition: {
  readonly type: TType;
  readonly payloadSchema: z.ZodType<TPayload>;
}): OutboxMessageDefinition<TType, TPayload> {
  return definition;
}

export type OutboxMessageDefinitionMap = Record<string, OutboxMessageDefinition>;

export type OutboxPayloadOf<TDefinition extends OutboxMessageDefinition> =
  TDefinition extends OutboxMessageDefinition<string, infer TPayload> ? TPayload : never;

// A handler carries its message definition (type + payload schema together, so
// they can't desync) and receives the already-parsed payload. Handlers run at
// least once and possibly out of enqueue order (retries + backoff), so they
// must be idempotent and converge to *current* database state rather than
// trusting the payload as a snapshot.
export interface OutboxHandler<
  TDefinition extends OutboxMessageDefinition = OutboxMessageDefinition,
> {
  readonly message: TDefinition;
  handle(payload: OutboxPayloadOf<TDefinition>): Promise<void>;

  // Last rites: called once, after the attempt that exhausted the dispatcher's
  // `maxAttempts` moved the message to `dead`. This is where a feature
  // reconciles state it can no longer converge (flag the row, notify), knowing
  // the message will never be handled again.
  //
  // Best-effort, not part of the outcome: it runs after the `dead` status is
  // already recorded, outside any transaction, and its own failure is only
  // logged. It is also skipped in the two cases where the dispatcher has no
  // payload to hand over — an unregistered message type, and a stored payload
  // that no longer parses — and when a worker dies mid-attempt, since the row
  // is then buried by `markAbandonedDead` with no process left to call it.
  onDeadLetter?(payload: OutboxPayloadOf<TDefinition>, error: unknown): Promise<void>;
}
