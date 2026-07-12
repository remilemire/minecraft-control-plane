// apps/backend/src/features/sessions/sessions.service.test.ts

import { env } from "@/config/env.js";
import type { NewSession, Session, User } from "@/db/schema/index.js";
import { hashSecret } from "@/lib/tokens.js";
import { describe, expect, it } from "vitest";
import type { SessionRepository } from "./sessions.repository.js";
import { SessionService } from "./sessions.service.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "00000000-0000-0000-0000-0000000000aa",
    tokenHash: "hash",
    userId: USER_ID,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    googleId: "google-1",
    email: "player@example.com",
    firstName: null,
    lastName: null,
    isAdmin: false,
    createdAt: new Date(),
    ...overrides,
  };
}

// The repository is a class (nominal because of its private db field), so
// method-level stubs need the double cast.
function repositoryStub(
  methods: Partial<Record<keyof SessionRepository, unknown>>,
): SessionRepository {
  return methods as unknown as SessionRepository;
}

describe("SessionService", () => {
  describe("create", () => {
    it("stores only the sha256 hash, never the raw token", async () => {
      let stored: NewSession | undefined;
      const service = new SessionService(
        repositoryStub({
          create: async (input: NewSession) => {
            stored = input;
            return session({ tokenHash: input.tokenHash });
          },
        }),
      );

      const { sessionToken } = await service.create({ userId: USER_ID });

      expect(stored?.tokenHash).toBe(hashSecret(sessionToken));
      expect(stored?.tokenHash).not.toBe(sessionToken);
      // sha256 hex digest is 64 characters.
      expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("stamps expiresAt one configured TTL into the future", async () => {
      let stored: NewSession | undefined;
      const service = new SessionService(
        repositoryStub({
          create: async (input: NewSession) => {
            stored = input;
            return session({ expiresAt: input.expiresAt });
          },
        }),
      );

      const before = Date.now();
      await service.create({ userId: USER_ID });

      const expiresAt = stored?.expiresAt.getTime() ?? 0;
      expect(expiresAt).toBeGreaterThanOrEqual(before + env.SESSION_TTL_MS);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + env.SESSION_TTL_MS);
    });
  });

  describe("findValidWithUser", () => {
    it("returns the session and user for a valid token", async () => {
      const context = { session: session(), user: user() };
      let lookedUpHash: string | undefined;
      const service = new SessionService(
        repositoryStub({
          findByTokenHashWithUser: async (hash: string) => {
            lookedUpHash = hash;
            return context;
          },
        }),
      );

      const result = await service.findValidWithUser("raw-token");

      expect(result).toEqual(context);
      // Only the hash of the presented token ever reaches the repository.
      expect(lookedUpHash).toBe(hashSecret("raw-token"));
    });

    it("returns null for an expired session", async () => {
      const service = new SessionService(
        repositoryStub({
          findByTokenHashWithUser: async () => ({
            session: session({ expiresAt: new Date(Date.now() - 1_000) }),
            user: user(),
          }),
        }),
      );

      expect(await service.findValidWithUser("raw-token")).toBeNull();
    });

    it("returns null for an unknown token", async () => {
      const service = new SessionService(
        repositoryStub({ findByTokenHashWithUser: async () => null }),
      );

      expect(await service.findValidWithUser("raw-token")).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes the session for the given token and returns it", async () => {
      const removed = session();
      let deletedHash: string | undefined;
      const service = new SessionService(
        repositoryStub({
          deleteByTokenHash: async (hash: string) => {
            deletedHash = hash;
            return removed;
          },
        }),
      );

      expect(await service.delete("raw-token")).toEqual(removed);
      expect(deletedHash).toBe(hashSecret("raw-token"));
    });

    it("throws SESSION_NOT_FOUND when the token matches nothing", async () => {
      const service = new SessionService(repositoryStub({ deleteByTokenHash: async () => null }));

      await expect(service.delete("raw-token")).rejects.toMatchObject({
        code: "SESSION_NOT_FOUND",
      });
    });
  });
});
