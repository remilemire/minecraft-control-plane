// apps/backend/src/features/minecraft/profiles/profiles.service.test.ts

import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
import type { AppOutboxService } from "@/infrastructure/outbox/outbox.registry.js";
import { AppError } from "@/errors/app-error.js";
import { FakeMojangClient } from "@test/fakes/fake-mojang.client.js";
import { randomUUID } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MinecraftProfile } from "./profiles.schema.js";
import type { MinecraftProfileRepository } from "./profiles.repository.js";
import { MinecraftProfileService } from "./profiles.service.js";

const PROFILE_ID = "00000000-0000-0000-0000-0000000000bb";

function profile(overrides: Partial<MinecraftProfile> = {}): MinecraftProfile {
  return {
    id: PROFILE_ID,
    username: "Steve",
    uuid: randomUUID(),
    whitelistStatus: "pending",
    ...overrides,
  };
}

// The collaborators are classes (nominal because of their private fields), so
// method-level stubs need the double cast.
function repositoryStub(
  methods: Partial<Record<keyof MinecraftProfileRepository, unknown>>,
): MinecraftProfileRepository {
  return methods as unknown as MinecraftProfileRepository;
}

function serverServiceStub(onlineUsernames: readonly string[] = []): MinecraftServerService {
  return {
    listOnlineUsernames: async () => onlineUsernames,
  } as unknown as MinecraftServerService;
}

// A Minecraft server that isn't answering RCON — the state it's in for the
// minutes it takes to boot.
function unreachableServerServiceStub(): MinecraftServerService {
  return {
    listOnlineUsernames: async () => {
      throw new AppError("RCON_CLIENT_ERROR");
    },
  } as unknown as MinecraftServerService;
}

// Records every enqueued outbox message.
function outboxServiceRecorder() {
  const enqueued: { type: string; payload: unknown }[] = [];
  const service = {
    enqueue: async (type: string, payload: unknown) => {
      enqueued.push({ type, payload });
    },
  } as unknown as AppOutboxService;

  return { service, enqueued };
}

// Defaults to actually invoking the operation (like the real manager, minus
// the ambient transaction context). Tests proving a code path never opens a
// transaction use neverRunsTransactionManager instead.
function transactionManagerStub(): TransactionManager {
  return {
    run: async (operation: () => Promise<unknown>) => operation(),
  } as unknown as TransactionManager;
}

function neverRunsTransactionManager(): TransactionManager {
  return {
    run: async () => {
      throw new Error("must not open a transaction on this path");
    },
  } as unknown as TransactionManager;
}

describe("MinecraftProfileService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("merges profiles with their online and whitelist status", async () => {
      const online = profile({
        id: randomUUID(),
        username: "Steve",
        whitelistStatus: "whitelisted",
      });
      const offline = profile({ id: randomUUID(), username: "Alex", whitelistStatus: "failed" });
      const service = new MinecraftProfileService(
        repositoryStub({ findAll: async () => [online, offline] }),
        new FakeMojangClient(),
        serverServiceStub(["Steve"]),
        neverRunsTransactionManager(),
        outboxServiceRecorder().service,
      );

      expect(await service.list()).toEqual([
        {
          id: online.id,
          username: "Steve",
          uuid: online.uuid,
          online: true,
          whitelistStatus: "whitelisted",
        },
        {
          id: offline.id,
          username: "Alex",
          uuid: offline.uuid,
          online: false,
          whitelistStatus: "failed",
        },
      ]);
    });

    it("reports every profile offline when the server is unreachable", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const steve = profile({ username: "Steve", whitelistStatus: "whitelisted" });
      const service = new MinecraftProfileService(
        repositoryStub({ findAll: async () => [steve] }),
        new FakeMojangClient(),
        unreachableServerServiceStub(),
        neverRunsTransactionManager(),
        outboxServiceRecorder().service,
      );

      // The whitelist itself is in Postgres, so RCON being down costs the
      // online badge and nothing else — the list still answers.
      expect(await service.list()).toEqual([
        {
          id: steve.id,
          username: "Steve",
          uuid: steve.uuid,
          online: false,
          whitelistStatus: "whitelisted",
        },
      ]);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("resolves the canonical Mojang profile, inserts it, and enqueues the whitelist add", async () => {
      const mojang = new FakeMojangClient();
      const uuid = randomUUID();
      mojang.setProfile({ username: "Steve", uuid });
      const created = profile({ username: "Steve", uuid });
      const outbox = outboxServiceRecorder();

      let createInput: unknown;
      const service = new MinecraftProfileService(
        repositoryStub({
          create: async (input: unknown) => {
            createInput = input;
            return created;
          },
        }),
        mojang,
        serverServiceStub(),
        transactionManagerStub(),
        outbox.service,
      );

      // The caller supplies a differently-cased username.
      const result = await service.create({ username: "steve" });

      expect(createInput).toEqual({ username: "Steve", uuid });
      // Whitelisting happens through the outbox, so a fresh profile is pending.
      expect(result).toEqual({
        id: created.id,
        username: "Steve",
        uuid,
        online: false,
        whitelistStatus: "pending",
      });
      expect(outbox.enqueued).toEqual([
        {
          type: "minecraft.whitelistAdd",
          payload: { minecraftProfileId: created.id, username: "Steve" },
        },
      ]);
    });

    it("throws MOJANG_PROFILE_NOT_FOUND for an unknown username, without opening a transaction", async () => {
      const outbox = outboxServiceRecorder();
      const service = new MinecraftProfileService(
        repositoryStub({}),
        new FakeMojangClient(),
        serverServiceStub(),
        neverRunsTransactionManager(),
        outbox.service,
      );

      await expect(service.create({ username: "Ghost" })).rejects.toMatchObject({
        code: "MOJANG_PROFILE_NOT_FOUND",
      });
      expect(outbox.enqueued).toEqual([]);
    });
  });

  describe("deleteById", () => {
    it("deletes the profile and enqueues the whitelist remove", async () => {
      const removed = profile({ username: "Notch" });
      const outbox = outboxServiceRecorder();

      let deletedId: unknown;
      const service = new MinecraftProfileService(
        repositoryStub({
          deleteById: async (id: unknown) => {
            deletedId = id;
            return removed;
          },
        }),
        new FakeMojangClient(),
        serverServiceStub(),
        transactionManagerStub(),
        outbox.service,
      );

      await service.deleteById(removed.id);

      expect(deletedId).toBe(removed.id);
      expect(outbox.enqueued).toEqual([
        {
          type: "minecraft.whitelistRemove",
          payload: { minecraftProfileId: removed.id, username: "Notch" },
        },
      ]);
    });

    it("throws MINECRAFT_PROFILE_NOT_FOUND for an unknown id, enqueueing nothing", async () => {
      const outbox = outboxServiceRecorder();
      const service = new MinecraftProfileService(
        repositoryStub({ deleteById: async () => null }),
        new FakeMojangClient(),
        serverServiceStub(),
        transactionManagerStub(),
        outbox.service,
      );

      await expect(service.deleteById(PROFILE_ID)).rejects.toMatchObject({
        code: "MINECRAFT_PROFILE_NOT_FOUND",
      });
      expect(outbox.enqueued).toEqual([]);
    });
  });

  describe("findById / findByUsername", () => {
    it("passes through current state without throwing on absence", async () => {
      const existing = profile();
      const service = new MinecraftProfileService(
        repositoryStub({
          findById: async () => existing,
          findByUsername: async () => null,
        }),
        new FakeMojangClient(),
        serverServiceStub(),
        neverRunsTransactionManager(),
        outboxServiceRecorder().service,
      );

      expect(await service.findById(PROFILE_ID)).toEqual(existing);
      expect(await service.findByUsername("Ghost")).toBeNull();
    });
  });

  describe("markWhitelisted / markWhitelistFailed", () => {
    it("writes the outcome to the profile's whitelist status", async () => {
      const updates: { id: unknown; status: unknown }[] = [];
      const service = new MinecraftProfileService(
        repositoryStub({
          updateWhitelistStatus: async (id: unknown, status: unknown) => {
            updates.push({ id, status });
            return profile();
          },
        }),
        new FakeMojangClient(),
        serverServiceStub(),
        neverRunsTransactionManager(),
        outboxServiceRecorder().service,
      );

      await service.markWhitelisted(PROFILE_ID);
      await service.markWhitelistFailed(PROFILE_ID);

      expect(updates).toEqual([
        { id: PROFILE_ID, status: "whitelisted" },
        { id: PROFILE_ID, status: "failed" },
      ]);
    });

    it("no-ops when the profile is already gone", async () => {
      const service = new MinecraftProfileService(
        repositoryStub({ updateWhitelistStatus: async () => null }),
        new FakeMojangClient(),
        serverServiceStub(),
        neverRunsTransactionManager(),
        outboxServiceRecorder().service,
      );

      await expect(service.markWhitelisted(PROFILE_ID)).resolves.toBeUndefined();
    });
  });
});
