// apps/backend/src/infrastructure/outbox/outbox.service.ts

import type { OutboxMessageRepository } from "./outbox.repository.js";
import type { OutboxMessageDefinitionMap, OutboxPayloadOf } from "./outbox.types.js";

// The write side of the outbox. Generic over the aggregated definitions map so
// `enqueue` narrows the payload to the message's schema; the map is injected
// (from `outbox.registry.ts`, at the composition root) because importing it
// here would cycle back through the features' `*.outbox.ts` modules.
export class OutboxService<
  TDefinitions extends OutboxMessageDefinitionMap = OutboxMessageDefinitionMap,
> {
  public constructor(
    private readonly outboxMessages: OutboxMessageRepository,
    private readonly definitions: TDefinitions,
  ) {}

  // Call inside TransactionManager.run — the insert joins the caller's
  // ambient transaction (and throws MissingTransactionError outside one), so
  // the message commits or rolls back with the state change it belongs to.
  //
  // The message lands `pending` and due now; every status after that belongs
  // to the dispatcher, so there is deliberately no way to enqueue a message in
  // any other state.
  public async enqueue<TType extends keyof TDefinitions & string>(
    type: TType,
    payload: OutboxPayloadOf<TDefinitions[TType]>,
  ): Promise<void> {
    const definition = this.definitions[type];

    if (definition === undefined) {
      throw new Error(`Unknown outbox message type "${type}".`);
    }

    const parsed = definition.payloadSchema.parse(payload);
    await this.outboxMessages.insert({ type, payload: parsed });
  }
}
