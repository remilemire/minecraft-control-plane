// apps/backend/src/infrastructure/outbox/index.ts

// The outbox module's public surface: the contracts features implement
// (`outbox.types.js`) and the machinery the composition root wires
// (repository, service, dispatcher).
//
// Two modules are deliberately excluded:
// - `outbox.registry.ts` — it imports the features' `*.outbox.ts` modules,
//   which import this barrel; including it would be a cycle. Import it
//   directly (`@/infrastructure/outbox/outbox.registry.js`), the same rule
//   that keeps `db/schemas.ts` out of `db/index.js`.
// - `outbox.schema.ts` / `outbox.constraints.ts` — what the table *looks
//   like* flows through `@/infrastructure/db/schemas.js` and
//   `@/infrastructure/db/constraints.js` like every other table.

export * from "./outbox.dispatcher.js";
export * from "./outbox.repository.js";
export * from "./outbox.service.js";
export * from "./outbox.types.js";
