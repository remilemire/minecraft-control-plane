// apps/backend/src/infrastructure/outbox/outbox.registry.ts

// Every outbox message definition in the app, aggregated from the features
// that own them (`features/**/<feature>.outbox.ts`) — the same pattern as
// `db/schemas.ts` for tables and `errorMeta` for error codes. Deliberately
// outside the outbox barrel: this module imports the features, and the
// features import the barrel, so re-exporting it there would be a cycle.
//
// The composition root injects `outboxMessageDefinitions` into OutboxService
// (typing `enqueue` end-to-end) and cross-checks it against the wired
// handlers via `createOutboxHandlerRegistry`.
import { minecraftPlayerOutboxMessages } from "@/features/minecraft/players/players.outbox.js";
import type { OutboxService } from "./outbox.service.js";
import type { OutboxMessageDefinitionMap } from "./outbox.types.js";

export const outboxMessageDefinitions = {
  ...minecraftPlayerOutboxMessages,
} as const satisfies OutboxMessageDefinitionMap;

export type OutboxMessageDefinitions = typeof outboxMessageDefinitions;

// The app's concrete OutboxService instantiation — what feature services
// depend on (import type) instead of repeating the generic.
export type AppOutboxService = OutboxService<OutboxMessageDefinitions>;
