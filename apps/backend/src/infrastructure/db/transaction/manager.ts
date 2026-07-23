// apps/backend/src/infrastructure/db/transaction/manager.ts

import type { Db } from "@/infrastructure/db/types.js";
import { transactionContext } from "./context.js";

export class TransactionManager {
  public constructor(private readonly db: Db) {}

  public async run<T>(operation: () => Promise<T>): Promise<T> {
    const activeTransaction = transactionContext.get();

    if (activeTransaction) {
      return operation();
    }

    return this.db.transaction((tx) => transactionContext.run(tx, operation));
  }
}
