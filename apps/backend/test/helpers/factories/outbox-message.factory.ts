// apps/backend/test/helpers/factories/outbox-message.factory.ts

// Inserts directly with the root client (not the repository — that requires
// an ambient transaction) so tests can arrange rows in any state.
import { db } from "@/infrastructure/db/index.js";
import {
  outboxMessages,
  type NewOutboxMessage,
  type OutboxMessage,
} from "@/infrastructure/db/schemas.js";

export async function createOutboxMessage(
  overrides: Partial<NewOutboxMessage> = {},
): Promise<OutboxMessage> {
  const [message] = await db
    .insert(outboxMessages)
    .values({ type: "test.message", payload: {}, ...overrides })
    .returning();

  if (message === undefined) {
    throw new Error("createOutboxMessage: insert returned no row.");
  }

  return message;
}
