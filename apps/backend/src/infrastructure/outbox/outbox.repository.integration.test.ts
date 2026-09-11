// apps/backend/src/infrastructure/outbox/outbox.repository.integration.test.ts

import {
  db,
  DatabaseProvider,
  MissingTransactionError,
  TransactionManager,
} from "@/infrastructure/db/index.js";
import { outboxMessages } from "@/infrastructure/db/schemas.js";
import { createOutboxMessage } from "@test/helpers/factories/outbox-message.factory.js";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { OutboxMessageRepository } from "./outbox.repository.js";

// Fixed clock: rows are always arranged with explicit timestamps so nothing
// here depends on the database's now().
const NOW = new Date("2026-07-24T12:00:00Z");
const PAST = new Date("2026-07-24T11:00:00Z");
const FUTURE = new Date("2026-07-24T13:00:00Z");
const CLAIM_UNTIL = new Date("2026-07-24T12:00:30Z");

const CLAIM_DEFAULTS = { now: NOW, claimUntil: CLAIM_UNTIL, limit: 10, maxAttempts: 10 };

describe("OutboxMessageRepository", () => {
  const repository = new OutboxMessageRepository(new DatabaseProvider(db));
  const transactionManager = new TransactionManager(db);

  it("refunds maintenance attempts only for the current claim", async () => {
    const pending = await createOutboxMessage({ nextAttemptAt: PAST, attempts: 9 });
    const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);
    expect(claimed?.attempts).toBe(10);
    expect(
      await repository.markDeferred({
        id: pending.id,
        claimId: randomUUID(),
        nextAttemptAt: FUTURE,
      }),
    ).toBe(false);
    expect(
      await repository.markDeferred({
        id: pending.id,
        claimId: claimed!.claimId!,
        nextAttemptAt: FUTURE,
      }),
    ).toBe(true);
    const [saved] = await db.select().from(outboxMessages);
    expect(saved).toMatchObject({
      attempts: 9,
      status: "pending",
      claimId: claimed!.claimId,
      nextAttemptAt: FUTURE,
    });
    expect(
      await repository.markDeferred({
        id: pending.id,
        claimId: claimed!.claimId!,
        nextAttemptAt: FUTURE,
      }),
    ).toBe(false);
  });

  describe("insert", () => {
    it("throws MissingTransactionError outside a transaction", async () => {
      await expect(repository.insert({ type: "test.message", payload: {} })).rejects.toThrow(
        MissingTransactionError,
      );
    });

    it("persists a due-now message inside the ambient transaction", async () => {
      const inserted = await transactionManager.run(() =>
        repository.insert({ type: "test.message", payload: { value: 42 } }),
      );

      expect(inserted).toMatchObject({
        type: "test.message",
        payload: { value: 42 },
        status: "pending",
        attempts: 0,
        claimId: null,
        claimExpiresAt: null,
        lastError: null,
        completedAt: null,
      });

      const rows = await db.select().from(outboxMessages);
      expect(rows).toEqual([inserted]);
    });

    it("rolls back with the enclosing transaction", async () => {
      await expect(
        transactionManager.run(async () => {
          await repository.insert({ type: "test.message", payload: {} });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      expect(await db.select().from(outboxMessages)).toEqual([]);
    });
  });

  describe("claimBatch", () => {
    it("claims a due message: processing, fresh claimId, claimUntil, attempts + 1", async () => {
      const message = await createOutboxMessage({ nextAttemptAt: PAST });

      const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);

      expect(claimed).toMatchObject({
        id: message.id,
        status: "processing",
        attempts: 1,
        claimExpiresAt: CLAIM_UNTIL,
      });
      expect(claimed?.claimId).not.toBeNull();
    });

    it("skips completed, dead, not-yet-due, actively claimed, and exhausted messages", async () => {
      await createOutboxMessage({ nextAttemptAt: PAST, status: "completed", completedAt: PAST });
      await createOutboxMessage({ nextAttemptAt: PAST, status: "dead", attempts: 3 });
      await createOutboxMessage({ nextAttemptAt: FUTURE });
      await createOutboxMessage({
        nextAttemptAt: PAST,
        status: "processing",
        claimId: randomUUID(),
        claimExpiresAt: FUTURE,
      });
      await createOutboxMessage({ nextAttemptAt: PAST, attempts: 10 });

      expect(await repository.claimBatch(CLAIM_DEFAULTS)).toEqual([]);
    });

    it("re-claims an expired claim under a fresh claimId", async () => {
      const staleClaimId = randomUUID();
      const message = await createOutboxMessage({
        nextAttemptAt: PAST,
        status: "processing",
        claimId: staleClaimId,
        claimExpiresAt: PAST,
        attempts: 1,
      });

      const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);

      expect(claimed).toMatchObject({
        id: message.id,
        status: "processing",
        attempts: 2,
        claimExpiresAt: CLAIM_UNTIL,
      });
      expect(claimed?.claimId).not.toBe(staleClaimId);
    });

    it("honors the limit, oldest first, and returns rows in creation order", async () => {
      const second = await createOutboxMessage({
        nextAttemptAt: PAST,
        createdAt: new Date("2026-07-24T10:00:02Z"),
      });
      const first = await createOutboxMessage({
        nextAttemptAt: PAST,
        createdAt: new Date("2026-07-24T10:00:01Z"),
      });
      const third = await createOutboxMessage({
        nextAttemptAt: PAST,
        createdAt: new Date("2026-07-24T10:00:03Z"),
      });

      const claimed = await repository.claimBatch({ ...CLAIM_DEFAULTS, limit: 2 });

      expect(claimed.map((message) => message.id)).toEqual([first.id, second.id]);

      const [remaining] = await repository.claimBatch(CLAIM_DEFAULTS);
      expect(remaining?.id).toBe(third.id);
    });
  });

  describe("markCompleted", () => {
    it("completes the row while the claim still matches", async () => {
      await createOutboxMessage({ nextAttemptAt: PAST });
      const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);

      expect(
        await repository.markCompleted({
          id: claimed!.id,
          claimId: claimed!.claimId!,
          completedAt: NOW,
        }),
      ).toBe(true);

      const [row] = await db.select().from(outboxMessages);
      expect(row).toMatchObject({ status: "completed", completedAt: NOW, claimExpiresAt: null });

      // Completed rows are kept but never claimable again.
      expect(await repository.claimBatch(CLAIM_DEFAULTS)).toEqual([]);
    });

    it("is fenced: a stale claimId completes nothing", async () => {
      await createOutboxMessage({ nextAttemptAt: PAST });
      const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);

      expect(
        await repository.markCompleted({
          id: claimed!.id,
          claimId: randomUUID(),
          completedAt: NOW,
        }),
      ).toBe(false);

      const [row] = await db.select().from(outboxMessages);
      expect(row).toMatchObject({
        status: "processing",
        completedAt: null,
        claimId: claimed!.claimId,
      });
    });
  });

  describe("markFailed", () => {
    it("releases the claim back to pending and schedules the retry", async () => {
      await createOutboxMessage({ nextAttemptAt: PAST });
      const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);

      expect(
        await repository.markFailed({
          id: claimed!.id,
          claimId: claimed!.claimId!,
          status: "pending",
          nextAttemptAt: FUTURE,
          lastError: "RCON exploded",
        }),
      ).toBe(true);

      const [row] = await db.select().from(outboxMessages);
      expect(row).toMatchObject({
        status: "pending",
        nextAttemptAt: FUTURE,
        lastError: "RCON exploded",
        claimExpiresAt: null,
        completedAt: null,
      });

      // Gating is purely nextAttemptAt once the claim is released.
      expect(await repository.claimBatch(CLAIM_DEFAULTS)).toEqual([]);
      const [reclaimed] = await repository.claimBatch({
        ...CLAIM_DEFAULTS,
        now: new Date("2026-07-24T14:00:00Z"),
      });
      expect(reclaimed?.id).toBe(claimed!.id);
    });

    it("retires an exhausted message as dead", async () => {
      await createOutboxMessage({ nextAttemptAt: PAST, attempts: 9 });
      const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);

      expect(
        await repository.markFailed({
          id: claimed!.id,
          claimId: claimed!.claimId!,
          status: "dead",
          nextAttemptAt: FUTURE,
          lastError: "terminal",
        }),
      ).toBe(true);

      const [row] = await db.select().from(outboxMessages);
      expect(row).toMatchObject({ status: "dead", lastError: "terminal", claimExpiresAt: null });

      // Dead rows are kept, and no later clock brings them back.
      expect(
        await repository.claimBatch({
          ...CLAIM_DEFAULTS,
          now: new Date("2026-07-25T00:00:00Z"),
          maxAttempts: 100,
        }),
      ).toEqual([]);
    });

    it("is fenced: a stale claimId changes nothing", async () => {
      await createOutboxMessage({ nextAttemptAt: PAST });
      const [claimed] = await repository.claimBatch(CLAIM_DEFAULTS);

      expect(
        await repository.markFailed({
          id: claimed!.id,
          claimId: randomUUID(),
          status: "pending",
          nextAttemptAt: FUTURE,
          lastError: "stale",
        }),
      ).toBe(false);

      const [row] = await db.select().from(outboxMessages);
      expect(row).toMatchObject({
        status: "processing",
        lastError: null,
        claimExpiresAt: CLAIM_UNTIL,
      });
    });
  });

  describe("markAbandonedDead", () => {
    it("buries a processing message whose claim expired with its attempts spent", async () => {
      const abandoned = await createOutboxMessage({
        nextAttemptAt: PAST,
        status: "processing",
        claimId: randomUUID(),
        claimExpiresAt: PAST,
        attempts: 10,
      });

      const buried = await repository.markAbandonedDead({ now: NOW, maxAttempts: 10 });

      // The buried rows come back so the dispatcher can still run their
      // onDeadLetter hooks.
      expect(buried).toHaveLength(1);
      expect(buried[0]).toMatchObject({ id: abandoned.id, status: "dead", claimExpiresAt: null });

      const [row] = await db.select().from(outboxMessages);
      expect(row).toMatchObject({ id: abandoned.id, status: "dead", claimExpiresAt: null });
    });

    it("hands a row to exactly one caller, so its last rites run once", async () => {
      await createOutboxMessage({
        nextAttemptAt: PAST,
        status: "processing",
        claimId: randomUUID(),
        claimExpiresAt: PAST,
        attempts: 10,
      });

      const [first, second] = await Promise.all([
        repository.markAbandonedDead({ now: NOW, maxAttempts: 10 }),
        repository.markAbandonedDead({ now: NOW, maxAttempts: 10 }),
      ]);

      expect([first!.length, second!.length].sort()).toEqual([0, 1]);
    });

    it("buries a worker that died mid-attempt, end to end", async () => {
      // The whole sequence: a message is claimed, its worker dies without
      // recording anything, and the claim quietly expires.
      await createOutboxMessage({ nextAttemptAt: PAST });
      const [claimed] = await repository.claimBatch({ ...CLAIM_DEFAULTS, maxAttempts: 1 });
      expect(claimed).toMatchObject({ status: "processing", attempts: 1 });

      const afterClaimExpired = new Date(CLAIM_UNTIL.getTime() + 1_000);

      // Nothing is claimable in the meantime — the claim is still live.
      expect(await repository.claimBatch({ ...CLAIM_DEFAULTS, maxAttempts: 1 })).toEqual([]);

      const buried = await repository.markAbandonedDead({
        now: afterClaimExpired,
        maxAttempts: 1,
      });

      expect(buried.map((row) => row.id)).toEqual([claimed!.id]);
      // Its last recorded error (none here) is all the dispatcher has to go on.
      expect(buried[0]).toMatchObject({ status: "dead", attempts: 1, lastError: null });

      // And it stays buried: no later tick claims it again.
      expect(
        await repository.claimBatch({ ...CLAIM_DEFAULTS, now: afterClaimExpired, maxAttempts: 1 }),
      ).toEqual([]);
    });

    it("leaves a dead worker's message claimable while attempts remain", async () => {
      await createOutboxMessage({
        nextAttemptAt: PAST,
        status: "processing",
        claimId: randomUUID(),
        claimExpiresAt: PAST,
        attempts: 1,
      });

      expect(await repository.markAbandonedDead({ now: NOW, maxAttempts: 10 })).toEqual([]);

      // The expired claim is what makes it claimable again; attempts keep
      // counting up from where the dead worker left off.
      const [reclaimed] = await repository.claimBatch(CLAIM_DEFAULTS);
      expect(reclaimed).toMatchObject({ status: "processing", attempts: 2 });
    });

    it("leaves live claims, retryable messages, and terminal rows alone", async () => {
      // Claim still held, attempts spent.
      await createOutboxMessage({
        status: "processing",
        claimId: randomUUID(),
        claimExpiresAt: FUTURE,
        attempts: 10,
      });
      // Claim expired, attempts left.
      await createOutboxMessage({
        status: "processing",
        claimId: randomUUID(),
        claimExpiresAt: PAST,
        attempts: 4,
      });
      // Never claimed.
      await createOutboxMessage({ attempts: 10 });
      await createOutboxMessage({ status: "completed", completedAt: PAST, attempts: 10 });

      expect(await repository.markAbandonedDead({ now: NOW, maxAttempts: 10 })).toEqual([]);

      const rows = await db.select().from(outboxMessages);
      expect(rows.map((row) => row.status).sort()).toEqual([
        "completed",
        "pending",
        "processing",
        "processing",
      ]);
    });
  });
});
