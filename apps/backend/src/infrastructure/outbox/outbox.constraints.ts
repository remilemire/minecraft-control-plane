// apps/backend/src/infrastructure/outbox/outbox.constraints.ts

// The table has no unique/FK constraints; this names its one (partial) index.
// Index names never feed `withDbErrors` (indexes can't raise violations), but
// they follow the same explicit-name convention so a rename can't desync the
// schema from the migrations.
export const OUTBOX_MESSAGES_CONSTRAINTS = {
  CLAIMABLE_INDEX: "outbox_messages_claimable_index",
} as const;
