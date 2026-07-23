// apps/backend/src/db/provider.ts

import { transactionContext } from "./transaction/index.js";
import type { DatabaseExecutor, Db } from "./types.js";

export class DatabaseProvider {
  public constructor(private readonly db: Db) {}

  public get(): DatabaseExecutor {
    return transactionContext.get() ?? this.db;
  }
}
