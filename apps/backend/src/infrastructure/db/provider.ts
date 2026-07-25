// apps/backend/src/infrastructure/db/provider.ts

import { transactionContext } from "./transaction/index.js";
import type { DatabaseExecutor, Db, Tx } from "./types.js";

export class DatabaseProvider {
  public constructor(private readonly db: Db) {}

  public get(): DatabaseExecutor {
    return transactionContext.get() ?? this.db;
  }

  // The ambient transaction, or throws MissingTransactionError. For writes
  // that are only correct as part of the caller's unit of work (e.g. an
  // outbox enqueue), where falling back to the root client would silently
  // drop atomicity.
  public require(): Tx {
    return transactionContext.require();
  }
}
