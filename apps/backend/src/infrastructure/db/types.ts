// apps/backend/src/infrastructure/db/types.ts

import type { db } from "./database.js";

export type Db = typeof db;

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DatabaseExecutor = Db | Tx;
