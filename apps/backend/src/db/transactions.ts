// apps/backend/src/db/transactions.ts

// TODO: REMOVE

import type { Db } from "@/db/client.js";

// The transaction-bound client drizzle passes into a `db.transaction(...)`
// callback. Derived structurally from `Db["transaction"]` so it always
// matches whatever driver `db/client.ts` wires up.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The only place a service-adjacent object touches `db.transaction` directly.
// Repositories and services stay agnostic of the transaction API itself; they
// just accept a `Tx` (via `withTx`) wherever they run a query.
export class TransactionRunner {
  public constructor(private readonly db: Db) {}

  public async run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await this.db.transaction(fn);
  }
}
