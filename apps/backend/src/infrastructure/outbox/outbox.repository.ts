// apps/backend/src/infrastructure/outbox/outbox.repository.ts

import { AppError } from "@/errors/app-error.js";
import { withDbErrors, type DatabaseProvider } from "@/infrastructure/db/index.js";
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { outboxMessages, type OutboxMessage } from "./outbox.schema.js";

export interface EnqueueOutboxMessageInput {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

// The repository owns no clock: callers pass every timestamp explicitly, which
// keeps claiming/backoff policy in the dispatcher and these queries
// deterministic under test.
export interface ClaimBatchInput {
  readonly now: Date;
  readonly claimUntil: Date;
  readonly limit: number;
  readonly maxAttempts: number;
}

export interface MarkCompletedInput {
  readonly id: string;
  readonly claimId: string;
  readonly completedAt: Date;
}

export interface MarkFailedInput {
  readonly id: string;
  readonly claimId: string;
  readonly nextAttemptAt: Date;
  readonly lastError: string;
}

export class OutboxMessageRepository {
  public constructor(private readonly databaseProvider: DatabaseProvider) {}

  // Joins the caller's ambient transaction — the message must commit or roll
  // back with the state change it belongs to, so enqueueing outside a
  // transaction is a programming error (MissingTransactionError).
  public async insert(input: EnqueueOutboxMessageInput): Promise<OutboxMessage> {
    const transaction = this.databaseProvider.require();

    const [message] = await withDbErrors(() =>
      transaction.insert(outboxMessages).values(input).returning(),
    );

    if (message === undefined) {
      throw new AppError("SERVICE_UNAVAILABLE", { message: "Failed to enqueue outbox message." });
    }

    return message;
  }

  // Claims up to `limit` due messages in one statement: the CTE picks the
  // oldest due rows under FOR UPDATE SKIP LOCKED, the UPDATE stamps a fresh
  // `claimId` (the fencing token markCompleted/markFailed must present) and
  // pushes `claimExpiresAt` to `claimUntil`. `attempts` increments at claim
  // time, so a worker that dies mid-handler still consumed an attempt once the
  // claim expires. Returns the claimed rows in creation order.
  public async claimBatch(input: ClaimBatchInput): Promise<OutboxMessage[]> {
    const executor = this.databaseProvider.get();

    const claimable = executor.$with("claimable").as(
      executor
        .select({ id: outboxMessages.id })
        .from(outboxMessages)
        .where(
          and(
            isNull(outboxMessages.completedAt),
            lt(outboxMessages.attempts, input.maxAttempts),
            lte(outboxMessages.nextAttemptAt, input.now),
            or(
              isNull(outboxMessages.claimExpiresAt),
              lte(outboxMessages.claimExpiresAt, input.now),
            ),
          ),
        )
        .orderBy(asc(outboxMessages.createdAt))
        .limit(input.limit)
        .for("update", { skipLocked: true }),
    );

    const claimed = await withDbErrors(() =>
      executor
        .with(claimable)
        .update(outboxMessages)
        .set({
          claimId: sql`gen_random_uuid()`,
          claimExpiresAt: input.claimUntil,
          attempts: sql`${outboxMessages.attempts} + 1`,
        })
        .where(inArray(outboxMessages.id, executor.select({ id: claimable.id }).from(claimable)))
        .returning(),
    );

    // UPDATE ... RETURNING has no defined row order.
    return claimed.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  // Compare-and-set on the claim: false means the claim was lost (it expired
  // and the message was re-claimed under a new claimId) and nothing changed.
  public async markCompleted(input: MarkCompletedInput): Promise<boolean> {
    const completed = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .update(outboxMessages)
        .set({ completedAt: input.completedAt, claimExpiresAt: null })
        .where(this.claimGuard(input.id, input.claimId))
        .returning({ id: outboxMessages.id }),
    );

    return completed.length > 0;
  }

  // Same fencing contract as markCompleted. Releases the claim and schedules
  // the retry; gating is purely `nextAttemptAt` afterwards.
  public async markFailed(input: MarkFailedInput): Promise<boolean> {
    const failed = await withDbErrors(() =>
      this.databaseProvider
        .get()
        .update(outboxMessages)
        .set({
          nextAttemptAt: input.nextAttemptAt,
          lastError: input.lastError,
          claimExpiresAt: null,
        })
        .where(this.claimGuard(input.id, input.claimId))
        .returning({ id: outboxMessages.id }),
    );

    return failed.length > 0;
  }

  private claimGuard(id: string, claimId: string) {
    return and(
      eq(outboxMessages.id, id),
      eq(outboxMessages.claimId, claimId),
      isNull(outboxMessages.completedAt),
    );
  }
}
