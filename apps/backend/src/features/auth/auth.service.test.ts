// apps/backend/src/features/auth/auth.service.test.ts

import { env } from "@/config/env.js";
import { AppError } from "@/errors/app-error.js";
import type { User } from "@/infrastructure/db/schemas.js";
import type { OAuthIdentity } from "./oauth-identities/oauth-identities.schema.js";
import type { Session } from "./sessions/sessions.schema.js";
import type { TransactionManager } from "@/infrastructure/db/index.js";
import { FakeGoogleOauthClient } from "@test/fakes/fake-google-oauth.client.js";
import { describe, expect, it } from "vitest";
import type { UserService } from "@/features/users/users.service.js";
import type { OAuthIdentityService } from "./oauth-identities/oauth-identities.service.js";
import type { SessionService } from "./sessions/sessions.service.js";
import type { SessionWithToken, SessionWithUser } from "./sessions/sessions.types.js";
import { AuthService } from "./auth.service.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const IDENTITY_ID = "00000000-0000-0000-0000-0000000000bb";

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: "steve@example.com",
    fullName: null,
    isOwner: false,
    createdAt: new Date(),
    ...overrides,
  };
}

function oauthIdentity(overrides: Partial<OAuthIdentity> = {}): OAuthIdentity {
  return {
    id: IDENTITY_ID,
    userId: USER_ID,
    provider: "google",
    subject: "google-abc",
    createdAt: new Date(),
    ...overrides,
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "00000000-0000-0000-0000-0000000000aa",
    tokenHash: "hash",
    userId: USER_ID,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 1_000),
    ...overrides,
  };
}

// The services/repositories are classes (nominal because of their private
// fields), so method-level stubs need the double cast.
function userServiceStub(methods: Partial<Record<keyof UserService, unknown>>): UserService {
  return methods as unknown as UserService;
}
function sessionServiceStub(
  methods: Partial<Record<keyof SessionService, unknown>>,
): SessionService {
  return methods as unknown as SessionService;
}
function oauthIdentityServiceStub(
  methods: Partial<Record<keyof OAuthIdentityService, unknown>>,
): OAuthIdentityService {
  return methods as unknown as OAuthIdentityService;
}
// Defaults to actually invoking the operation (like the real manager, minus
// the ambient transaction context), so tests that only care about what
// happens *inside* the transaction don't need to repeat the plumbing. Tests
// proving a code path never opens a transaction override `run` to throw
// instead.
function transactionManagerStub(
  overrides: Partial<Record<keyof TransactionManager, unknown>> = {},
): TransactionManager {
  return {
    run: async (operation: () => Promise<unknown>) => operation(),
    ...overrides,
  } as unknown as TransactionManager;
}
// Proves a code path returns without ever opening a transaction: if it were
// entered, the test would fail with this error instead of the expected one.
function neverRunsTransactionManager(): TransactionManager {
  return transactionManagerStub({
    run: async () => {
      throw new Error("must not open a transaction on this path");
    },
  });
}

const issuedSession: SessionWithToken = { session: session(), sessionToken: "session-token" };

describe("AuthService", () => {
  describe("authenticateWithOAuth", () => {
    it("creates a session for an existing user, without creating a user or identity", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "steve@example.com",
        sub: "google-abc",
      });
      const existing = user();

      let lookedUpProvider: string | undefined;
      let lookedUpSubject: string | undefined;
      let sessionUserId: string | undefined;

      const service = new AuthService(
        userServiceStub({
          findByEmail: async () => {
            throw new Error("a linked identity must not fall back to the email lookup");
          },
        }),
        sessionServiceStub({
          create: async ({ userId }: { userId: string }) => {
            sessionUserId = userId;
            return issuedSession;
          },
        }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async (provider: string, subject: string) => {
            lookedUpProvider = provider;
            lookedUpSubject = subject;
            return { identity: oauthIdentity(), user: existing };
          },
          create: async () => {
            throw new Error("an already-linked identity must not be re-created");
          },
        }),
        neverRunsTransactionManager(),
      );

      const result = await service.authenticateWithOAuth({ credential, provider: "google" });

      expect(result).toEqual({ user: existing, sessionToken: "session-token" });
      // The user is matched by (provider, subject), not their email.
      expect(lookedUpProvider).toBe("google");
      expect(lookedUpSubject).toBe("google-abc");
      expect(sessionUserId).toBe(existing.id);
    });

    it("claims a provisioned account on first login by linking the identity, without a transaction", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "provisioned@example.com",
        sub: "google-provisioned",
      });
      const provisioned = user({ email: "provisioned@example.com" });

      let lookedUpEmail: unknown;
      let identityInput: unknown;

      const service = new AuthService(
        userServiceStub({
          findByEmail: async (email: unknown) => {
            lookedUpEmail = email;
            return provisioned;
          },
          create: async () => {
            throw new Error("a provisioned user must not be re-created");
          },
          createOwner: async () => {
            throw new Error("claiming a provisioned account must not create an owner");
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async (input: unknown) => {
            identityInput = input;
            return oauthIdentity({ userId: provisioned.id, subject: "google-provisioned" });
          },
        }),
        // Linking is a single insert; it must not open a transaction.
        neverRunsTransactionManager(),
      );

      const result = await service.authenticateWithOAuth({ credential, provider: "google" });

      expect(result).toEqual({ user: provisioned, sessionToken: "session-token" });
      expect(lookedUpEmail).toBe("provisioned@example.com");
      expect(identityInput).toEqual({
        userId: provisioned.id,
        provider: "google",
        subject: "google-provisioned",
      });
    });

    it("normalizes the provider email before matching it against provisioned users", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "  Steve@Example.COM ",
        sub: "google-cased",
      });
      const provisioned = user();

      let lookedUpEmail: unknown;

      const service = new AuthService(
        userServiceStub({
          findByEmail: async (email: unknown) => {
            lookedUpEmail = email;
            return provisioned;
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async () => oauthIdentity({ subject: "google-cased" }),
        }),
        neverRunsTransactionManager(),
      );

      await service.authenticateWithOAuth({ credential, provider: "google" });

      expect(lookedUpEmail).toBe("steve@example.com");
    });

    it("bootstraps the first account as the owner: user then identity, inside the transaction", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: env.BOOTSTRAP_OWNER_EMAIL,
        sub: "google-bootstrap",
        name: "First Owner",
      });
      const created = user({
        email: env.BOOTSTRAP_OWNER_EMAIL,
        fullName: "First Owner",
        isOwner: true,
      });

      const callOrder: string[] = [];
      let createOwnerInput: unknown;
      let identityInput: unknown;

      const service = new AuthService(
        userServiceStub({
          findByEmail: async () => null,
          findOwner: async () => null,
          create: async () => {
            throw new Error("the bootstrap registration must create an owner, not a plain user");
          },
          createOwner: async (input: unknown) => {
            callOrder.push("create-owner");
            createOwnerInput = input;
            return created;
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async (input: unknown) => {
            callOrder.push("create-identity");
            identityInput = input;
            return oauthIdentity({ subject: "google-bootstrap" });
          },
        }),
        transactionManagerStub(),
      );

      const result = await service.authenticateWithOAuth({ credential, provider: "google" });

      expect(result).toEqual({ user: created, sessionToken: "session-token" });
      expect(createOwnerInput).toEqual({
        email: env.BOOTSTRAP_OWNER_EMAIL,
        fullName: "First Owner",
      });
      // The identity insert must reference the just-created owner's id, and
      // happen strictly after the user row exists.
      expect(identityInput).toEqual({
        userId: created.id,
        provider: "google",
        subject: "google-bootstrap",
      });
      expect(callOrder).toEqual(["create-owner", "create-identity"]);
    });

    it("rejects the bootstrap owner email once an owner exists, with the one login failure code", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: env.BOOTSTRAP_OWNER_EMAIL,
        sub: "google-bootstrap-again",
      });

      const service = new AuthService(
        userServiceStub({
          findByEmail: async () => null,
          findOwner: async () =>
            user({ id: "00000000-0000-0000-0000-0000000000ee", isOwner: true }),
          createOwner: async () => {
            throw new Error("a second owner must never be created");
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async () => {
            throw new Error("no identity must be created when registration is rejected");
          },
        }),
        neverRunsTransactionManager(),
      );

      await expect(
        service.authenticateWithOAuth({ credential, provider: "google" }),
      ).rejects.toMatchObject({
        code: "AUTHENTICATION_FAILED",
      });
    });

    it("rejects an unregistered email with the same code as every other login failure", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({ email: "stranger@example.com" });

      const service = new AuthService(
        userServiceStub({
          findByEmail: async () => null,
          findOwner: async () => {
            throw new Error("only the bootstrap owner email may check for an existing owner");
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async () => {
            throw new Error("no identity must be created when registration is rejected");
          },
        }),
        neverRunsTransactionManager(),
      );

      await expect(
        service.authenticateWithOAuth({ credential, provider: "google" }),
      ).rejects.toMatchObject({
        code: "AUTHENTICATION_FAILED",
      });
    });

    it("collapses a lost bootstrap race into AUTHENTICATION_FAILED", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: env.BOOTSTRAP_OWNER_EMAIL,
        sub: "google-raced",
      });

      const service = new AuthService(
        userServiceStub({
          findByEmail: async () => null,
          findOwner: async () => null,
          // A concurrent bootstrap won between the reads and the insert; the
          // database invariant reports it as a conflict.
          createOwner: async () => {
            throw new AppError("EMAIL_TAKEN");
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async () => {
            throw new Error("no identity must be created when the owner insert failed");
          },
        }),
        transactionManagerStub(),
      );

      await expect(
        service.authenticateWithOAuth({ credential, provider: "google" }),
      ).rejects.toMatchObject({
        code: "AUTHENTICATION_FAILED",
      });
    });

    it("rejects a token without a verified email with AUTHENTICATION_FAILED", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "steve@example.com",
        email_verified: false,
      });

      const service = new AuthService(
        userServiceStub({}),
        sessionServiceStub({}),
        { google: googleOauthClient },
        oauthIdentityServiceStub({}),
        neverRunsTransactionManager(),
      );

      await expect(
        service.authenticateWithOAuth({ credential, provider: "google" }),
      ).rejects.toMatchObject({
        code: "AUTHENTICATION_FAILED",
      });
    });
  });

  describe("authenticateFromSession", () => {
    it("returns the user and session for a valid token", async () => {
      const context: SessionWithUser = { user: user(), session: session() };
      let lookedUpToken: string | undefined;

      const service = new AuthService(
        userServiceStub({}),
        sessionServiceStub({
          findValidWithUser: async (token: string) => {
            lookedUpToken = token;
            return context;
          },
        }),
        { google: new FakeGoogleOauthClient() },
        oauthIdentityServiceStub({}),
        neverRunsTransactionManager(),
      );

      const result = await service.authenticateFromSession("raw-token");

      expect(result).toEqual(context);
      expect(lookedUpToken).toBe("raw-token");
    });

    it("throws INVALID_SESSION for an unknown or expired token", async () => {
      const service = new AuthService(
        userServiceStub({}),
        sessionServiceStub({ findValidWithUser: async () => null }),
        { google: new FakeGoogleOauthClient() },
        oauthIdentityServiceStub({}),
        neverRunsTransactionManager(),
      );

      await expect(service.authenticateFromSession("nope")).rejects.toMatchObject({
        code: "INVALID_SESSION",
      });
    });
  });

  describe("logout", () => {
    it("deletes the session for the given token", async () => {
      let deletedToken: string | undefined;
      const service = new AuthService(
        userServiceStub({}),
        sessionServiceStub({
          delete: async (token: string) => {
            deletedToken = token;
            return session();
          },
        }),
        { google: new FakeGoogleOauthClient() },
        oauthIdentityServiceStub({}),
        neverRunsTransactionManager(),
      );

      await service.logout("raw-token");

      expect(deletedToken).toBe("raw-token");
    });
  });
});
