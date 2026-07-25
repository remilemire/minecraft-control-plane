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
}
