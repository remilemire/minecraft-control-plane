// apps/backend/src/features/users/users.service.test.ts

import type { TransactionManager } from "@/infrastructure/db/index.js";
import { describe, expect, it } from "vitest";
import type { User } from "./users.schema.js";
import type { UserRepository } from "./users.repository.js";
import { UserService } from "./users.service.js";

const OWNER_ID = "00000000-0000-0000-0000-000000000001";
const TARGET_ID = "00000000-0000-0000-0000-000000000002";

function user(overrides: Partial<User> = {}): User {
  return {
    id: OWNER_ID,
    email: "steve@example.com",
    fullName: null,
    isOwner: false,
    createdAt: new Date(),
    ...overrides,
  };
}

// The repository is a class (nominal because of its private db field), so
// method-level stubs need the double cast.
function repositoryStub(methods: Partial<Record<keyof UserRepository, unknown>>): UserRepository {
  return methods as unknown as UserRepository;
}
// Defaults to actually invoking the operation (like the real manager, minus
// the ambient transaction context). Tests proving a code path never opens a
// transaction override `run` to throw instead.
function transactionManagerStub(
  overrides: Partial<Record<keyof TransactionManager, unknown>> = {},
): TransactionManager {
  return {
    run: async (operation: () => Promise<unknown>) => operation(),
    ...overrides,
  } as unknown as TransactionManager;
}
function neverRunsTransactionManager(): TransactionManager {
  return transactionManagerStub({
    run: async () => {
      throw new Error("must not open a transaction on this path");
    },
  });
}

describe("UserService", () => {
  describe("create / createOwner", () => {
    it("creates a plain user without touching the owner flag", async () => {
      let createInput: unknown;
      const service = new UserService(
        repositoryStub({
          create: async (input: unknown) => {
            createInput = input;
            return user();
          },
        }),
        neverRunsTransactionManager(),
      );

      await service.create({ email: "steve@example.com" });

      expect(createInput).toEqual({ email: "steve@example.com" });
    });

    it("creates the owner with isOwner set", async () => {
      let createInput: unknown;
      const service = new UserService(
        repositoryStub({
          create: async (input: unknown) => {
            createInput = input;
            return user({ isOwner: true });
          },
        }),
        neverRunsTransactionManager(),
      );

      await service.createOwner({ email: "steve@example.com" });

      expect(createInput).toEqual({ email: "steve@example.com", isOwner: true });
    });
  });

  describe("transferOwnership", () => {
    it("checks the target, demotes the caller, then promotes the target, in one transaction", async () => {
      const promoted = user({ id: TARGET_ID, isOwner: true });
      const callOrder: string[] = [];

      const service = new UserService(
        repositoryStub({
          findById: async (id: unknown) => {
            callOrder.push(`find:${String(id)}`);
            return user({ id: TARGET_ID });
          },
          clearOwner: async (id: unknown) => {
            callOrder.push(`clear:${String(id)}`);
            return user({ id: OWNER_ID });
          },
          setOwner: async (id: unknown) => {
            callOrder.push(`set:${String(id)}`);
            return promoted;
          },
        }),
        transactionManagerStub(),
      );

      const result = await service.transferOwnership(OWNER_ID, TARGET_ID);

      expect(result).toEqual(promoted);
      // Demote-before-promote is load-bearing: the partial unique index
      // rejects a second owner row.
      expect(callOrder).toEqual([`find:${TARGET_ID}`, `clear:${OWNER_ID}`, `set:${TARGET_ID}`]);
    });

    it("rejects a self-transfer without opening a transaction", async () => {
      const service = new UserService(repositoryStub({}), neverRunsTransactionManager());

      await expect(service.transferOwnership(OWNER_ID, OWNER_ID)).rejects.toMatchObject({
        code: "CANNOT_TRANSFER_TO_SELF",
      });
    });

    it("throws USER_NOT_FOUND for an unknown target, before demoting anyone", async () => {
      const service = new UserService(
        repositoryStub({
          findById: async () => null,
          clearOwner: async () => {
            throw new Error("the caller must not be demoted when the target is missing");
          },
        }),
        transactionManagerStub(),
      );

      await expect(service.transferOwnership(OWNER_ID, TARGET_ID)).rejects.toMatchObject({
        code: "USER_NOT_FOUND",
      });
    });

    it("throws NOT_OWNER when the caller lost ownership mid-flight", async () => {
      const service = new UserService(
        repositoryStub({
          findById: async () => user({ id: TARGET_ID }),
          clearOwner: async () => null,
          setOwner: async () => {
            throw new Error("nobody must be promoted when the caller wasn't the owner");
          },
        }),
        transactionManagerStub(),
      );

      await expect(service.transferOwnership(OWNER_ID, TARGET_ID)).rejects.toMatchObject({
        code: "NOT_OWNER",
      });
    });

    it("throws USER_NOT_FOUND when the target vanishes between the check and the promotion", async () => {
      const service = new UserService(
        repositoryStub({
          findById: async () => user({ id: TARGET_ID }),
          clearOwner: async () => user({ id: OWNER_ID }),
          setOwner: async () => null,
        }),
        transactionManagerStub(),
      );

      await expect(service.transferOwnership(OWNER_ID, TARGET_ID)).rejects.toMatchObject({
        code: "USER_NOT_FOUND",
      });
    });
  });
});
