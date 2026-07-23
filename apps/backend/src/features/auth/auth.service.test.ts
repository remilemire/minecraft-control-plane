// apps/backend/src/features/auth/auth.service.test.ts

import { env } from "@/config/env.js";
import type { Invitation, OAuthIdentity, Session, User } from "@/infrastructure/db/schema/index.js";
import type { TransactionManager } from "@/infrastructure/db/transaction/index.js";
import { FakeGoogleOauthClient } from "@test/fakes/fake-google-oauth.client.js";
import { describe, expect, it } from "vitest";
import type { InvitationService } from "@/features/invitations/invitations.service.js";
import type { UserService } from "@/features/users/users.service.js";
import type { OAuthIdentityService } from "./oauth-identities/oauth-identities.service.js";
import type { SessionService } from "./sessions/sessions.service.js";
import type { SessionWithToken, SessionWithUser } from "./sessions/sessions.types.js";
import { AuthService } from "./auth.service.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const IDENTITY_ID = "00000000-0000-0000-0000-0000000000bb";
const INVITATION_ID = "00000000-0000-0000-0000-0000000000cc";

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: "steve@example.com",
    fullName: null,
    isAdmin: false,
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

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: INVITATION_ID,
    email: "invited@example.com",
    invitedByUserId: "00000000-0000-0000-0000-0000000000dd",
    acceptedByUserId: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 1_000),
    acceptedAt: null,
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
function invitationServiceStub(
  methods: Partial<Record<keyof InvitationService, unknown>>,
): InvitationService {
  return methods as unknown as InvitationService;
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
          create: async () => {
            throw new Error("existing users must not be re-created");
          },
          bootstrapAdmin: async () => {
            throw new Error("existing users must not be re-created");
          },
        }),
        sessionServiceStub({
          create: async ({ userId }: { userId: string }) => {
            sessionUserId = userId;
            return issuedSession;
          },
        }),
        invitationServiceStub({}),
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

    it("registers an invited user on first login: user, identity, then invitation acceptance, in order", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "invited@example.com",
        sub: "google-invited",
        name: "In Vited",
      });
      const created = user({ email: "invited@example.com", fullName: "In Vited" });
      const pending = invitation({ email: "invited@example.com" });

      const callOrder: string[] = [];
      let createInput: unknown;
      let identityInput: unknown;
      let acceptedId: unknown;
      let acceptedInput: unknown;

      const service = new AuthService(
        userServiceStub({
          create: async (input: unknown) => {
            callOrder.push("create-user");
            createInput = input;
            return created;
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        invitationServiceStub({
          findPending: async () => pending,
          markAccepted: async (id: unknown, input: unknown) => {
            callOrder.push("accept-invitation");
            acceptedId = id;
            acceptedInput = input;
            return invitation({ acceptedByUserId: created.id, acceptedAt: new Date() });
          },
        }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async (input: unknown) => {
            callOrder.push("create-identity");
            identityInput = input;
            return oauthIdentity();
          },
        }),
        transactionManagerStub(),
      );

      const result = await service.authenticateWithOAuth({ credential, provider: "google" });

      expect(result).toEqual({ user: created, sessionToken: "session-token" });
      expect(createInput).toEqual({
        email: "invited@example.com",
        fullName: "In Vited",
      });
      // The identity insert must reference the just-created user's id, and
      // happen strictly after the user row exists.
      expect(identityInput).toEqual({
        userId: created.id,
        provider: "google",
        subject: "google-invited",
      });
      // The invitation is consumed by the registration, attributed to the
      // user it created.
      expect(acceptedId).toBe(pending.id);
      expect(acceptedInput).toEqual({ acceptedByUserId: created.id });
      expect(callOrder).toEqual(["create-user", "create-identity", "accept-invitation"]);
    });

    it("bootstraps the configured ADMIN_EMAIL as an admin, bypassing the invite check", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: env.ADMIN_EMAIL,
        sub: "google-admin",
      });
      const created = user({ email: env.ADMIN_EMAIL, isAdmin: true });

      let bootstrapInput: unknown;
      let identityInput: unknown;
      const service = new AuthService(
        userServiceStub({
          bootstrapAdmin: async (input: unknown) => {
            bootstrapInput = input;
            return created;
          },
          create: async () => {
            throw new Error("the admin email must not go through the normal create path");
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        // findPending throwing proves the admin bootstrap path skips the
        // invitation check entirely, rather than happening to pass it.
        invitationServiceStub({
          findPending: async () => {
            throw new Error("the admin email must not be checked against invitations");
          },
          markAccepted: async () => {
            throw new Error("the admin bootstrap must not consume an invitation");
          },
        }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async (input: unknown) => {
            identityInput = input;
            return oauthIdentity();
          },
        }),
        transactionManagerStub(),
      );

      const result = await service.authenticateWithOAuth({ credential, provider: "google" });

      expect(result).toEqual({ user: created, sessionToken: "session-token" });
      expect(bootstrapInput).toEqual({ email: env.ADMIN_EMAIL });
      expect(identityInput).toEqual({
        userId: created.id,
        provider: "google",
        subject: "google-admin",
      });
    });

    it("does not bootstrap admin for a non-admin invited email", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "invited@example.com",
        sub: "google-invited",
      });
      const created = user({ email: "invited@example.com" });

      const service = new AuthService(
        userServiceStub({
          create: async () => created,
          bootstrapAdmin: async () => {
            throw new Error("non-admin emails must not be bootstrapped as admin");
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        invitationServiceStub({
          findPending: async () => invitation({ email: "invited@example.com" }),
          markAccepted: async () => invitation(),
        }),
        { google: googleOauthClient },
        oauthIdentityServiceStub({
          findBySubjectWithUser: async () => null,
          create: async () => oauthIdentity(),
        }),
        transactionManagerStub(),
      );

      const result = await service.authenticateWithOAuth({ credential, provider: "google" });

      expect(result).toEqual({ user: created, sessionToken: "session-token" });
    });

    it("rejects an uninvited email with NOT_INVITED, without creating an identity or opening a transaction", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({ email: "stranger@example.com" });

      // create/findBySubjectWithUser resolve so that a broken invitation
      // guard surfaces as an unexpected success (not a rejection) rather
      // than a masked error.
      const service = new AuthService(
        userServiceStub({
          create: async () => user({ email: "stranger@example.com" }),
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        invitationServiceStub({ findPending: async () => null }),
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
        code: "NOT_INVITED",
      });
    });

    it("rejects a token without a verified email with INVALID_GOOGLE_CREDENTIAL", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "steve@example.com",
        email_verified: false,
      });

      const service = new AuthService(
        userServiceStub({}),
        sessionServiceStub({}),
        invitationServiceStub({}),
        { google: googleOauthClient },
        oauthIdentityServiceStub({}),
        neverRunsTransactionManager(),
      );

      await expect(
        service.authenticateWithOAuth({ credential, provider: "google" }),
      ).rejects.toMatchObject({
        code: "INVALID_GOOGLE_CREDENTIAL",
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
        invitationServiceStub({}),
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
        invitationServiceStub({}),
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
        invitationServiceStub({}),
        { google: new FakeGoogleOauthClient() },
        oauthIdentityServiceStub({}),
        neverRunsTransactionManager(),
      );

      await service.logout("raw-token");

      expect(deletedToken).toBe("raw-token");
    });
  });
});
