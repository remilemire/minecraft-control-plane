// apps/backend/src/db/transaction/context.ts

import type { Tx } from "@/infrastructure/db/types.js";
import { AsyncLocalStorage } from "async_hooks";

interface TransactionStore {
  readonly tx: Tx;
}

const storage = new AsyncLocalStorage<TransactionStore>();

export class MissingTransactionError extends Error {
  public constructor() {
    super("This operation requires an active database transaction.");
    this.name = "MissingTransactionError";
  }
}

export const transactionContext = {
  run<T>(tx: Tx, cb: () => Promise<T>): Promise<T> {
    return storage.run({ tx }, cb);
  },

  get(): Tx | undefined {
    return storage.getStore()?.tx;
  },

  require(): Tx {
    const tx = storage.getStore()?.tx;

    if (!tx) {
      throw new MissingTransactionError();
    }

    return tx;
  },
};
