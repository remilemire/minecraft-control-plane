// apps/backend/src/features/auth/auth.service.test.ts

import type { Session, User } from "@/db/schema/index.js";
import { FakeGoogleOauthClient } from "@test/fakes/fake-google-oauth.client.js";
import { describe, expect, it } from "vitest";
import type { InvitationService } from "../invitations/invitations.service.js";
import type { SessionService } from "../sessions/sessions.service.js";
import type { SessionWithToken, SessionWithUser } from "../sessions/sessions.types.js";
import type { UserService } from "../users/users.service.js";
import { AuthService } from "./auth.service.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";

function user(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    googleId: "google-abc",
    email: "steve@example.com",
    firstName: null,
    lastName: null,
    minecraftUsername: null,
    minecraftUuid: null,
    isAdmin: false,
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

// The services are classes (nominal because of their private fields), so
// method-level stubs need the double cast.
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

const issuedSession: SessionWithToken = { session: session(), sessionToken: "session-token" };

describe("AuthService", () => {
  describe("authenticateFromGoogle", () => {
    it("creates a session for an existing user", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "steve@example.com",
        sub: "google-abc",
      });
      const existing = user();

      let lookedUpWith: string | undefined;
      let sessionUserId: string | undefined;

      const service = new AuthService(
        userServiceStub({
          findByGoogleId: async (id: string) => {
            lookedUpWith = id;
            return existing;
          },
          create: async () => {
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
        googleOauthClient,
      );

      const result = await service.authenticateFromGoogle(credential);

      expect(result).toEqual({ user: existing, sessionToken: "session-token" });
      // The user is matched by their Google subject id, not their email.
      expect(lookedUpWith).toBe("google-abc");
      expect(sessionUserId).toBe(existing.id);
    });

    it("registers an invited user on first login", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({
        email: "invited@example.com",
        sub: "google-invited",
        given_name: "In",
        family_name: "Vited",
      });
      const created = user({ email: "invited@example.com", firstName: "In", lastName: "Vited" });

      let createInput: unknown;
      const service = new AuthService(
        userServiceStub({
          findByGoogleId: async () => null,
          create: async (input: unknown) => {
            createInput = input;
            return created;
          },
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        invitationServiceStub({ isInvited: async () => true }),
        googleOauthClient,
      );

      const result = await service.authenticateFromGoogle(credential);

      expect(result).toEqual({ user: created, sessionToken: "session-token" });
      expect(createInput).toEqual({
        email: "invited@example.com",
        googleId: "google-invited",
        firstName: "In",
        lastName: "Vited",
      });
    });

    it("rejects an uninvited email with NOT_INVITED", async () => {
      const googleOauthClient = new FakeGoogleOauthClient();
      const credential = googleOauthClient.issueToken({ email: "stranger@example.com" });

      // create resolves so that a broken invitation guard surfaces as an
      // unexpected success (not a rejection) rather than a masked error.
      const service = new AuthService(
        userServiceStub({
          findByGoogleId: async () => null,
          create: async () => user({ email: "stranger@example.com" }),
        }),
        sessionServiceStub({ create: async () => issuedSession }),
        invitationServiceStub({ isInvited: async () => false }),
        googleOauthClient,
      );

      await expect(service.authenticateFromGoogle(credential)).rejects.toMatchObject({
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
        userServiceStub({ findByGoogleId: async () => null }),
        sessionServiceStub({}),
        invitationServiceStub({}),
        googleOauthClient,
      );

      await expect(service.authenticateFromGoogle(credential)).rejects.toMatchObject({
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
        new FakeGoogleOauthClient(),
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
        new FakeGoogleOauthClient(),
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
        new FakeGoogleOauthClient(),
      );

      await service.logout("raw-token");

      expect(deletedToken).toBe("raw-token");
    });
  });
});
