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

      expect(await repository.markAbandonedDead({ now: NOW, maxAttempts: 10 })).toBe(1);

      const [row] = await db.select().from(outboxMessages);
      expect(row).toMatchObject({ id: abandoned.id, status: "dead", claimExpiresAt: null });
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

      expect(await repository.markAbandonedDead({ now: NOW, maxAttempts: 10 })).toBe(0);

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
