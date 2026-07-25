// apps/backend/src/infrastructure/outbox/outbox.service.test.ts

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { EnqueueOutboxMessageInput, OutboxMessageRepository } from "./outbox.repository.js";
import { OutboxService } from "./outbox.service.js";
import { defineOutboxMessage } from "./outbox.types.js";

const testMessage = defineOutboxMessage({
  type: "test.message",
  payloadSchema: z.strictObject({ name: z.string() }),
});

const definitions = { [testMessage.type]: testMessage } as const;

// The repository is a class (nominal because of its private provider field),
// so method-level stubs need the double cast.
function repositoryStub(
  methods: Partial<Record<keyof OutboxMessageRepository, unknown>>,
): OutboxMessageRepository {
  return methods as unknown as OutboxMessageRepository;
}

describe("OutboxService", () => {
  it("parses the payload and inserts the message", async () => {
    const inserted: EnqueueOutboxMessageInput[] = [];
    const service = new OutboxService(
      repositoryStub({
        insert: async (input: EnqueueOutboxMessageInput) => {
          inserted.push(input);
          return input;
        },
      }),
      definitions,
    );

    await service.enqueue("test.message", { name: "Steve" });

    expect(inserted).toEqual([{ type: "test.message", payload: { name: "Steve" } }]);
  });

  it("rejects an invalid payload without inserting", async () => {
    const inserted: EnqueueOutboxMessageInput[] = [];
    const service = new OutboxService(
      repositoryStub({
        insert: async (input: EnqueueOutboxMessageInput) => {
          inserted.push(input);
          return input;
        },
      }),
      definitions,
    );

    await expect(service.enqueue("test.message", { name: 42 } as never)).rejects.toThrow(
      z.ZodError,
    );
    expect(inserted).toEqual([]);
  });

  it("throws on a type missing from the definitions", async () => {
    const service: OutboxService = new OutboxService(repositoryStub({}), definitions);

    await expect(service.enqueue("test.unknown", {})).rejects.toThrow(
      'Unknown outbox message type "test.unknown".',
    );
  });
});
