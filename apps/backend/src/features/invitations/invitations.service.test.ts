// apps/backend/src/features/invitations/invitations.service.test.ts

import { env } from "@/config/env.js";
import type { Invitation, NewInvitation } from "@/db/schema/index.js";
import { describe, expect, it } from "vitest";
import type { InvitationRepository } from "./invitations.repository.js";
import { InvitationService } from "./invitations.service.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const INVITATION_ID = "00000000-0000-0000-0000-000000000002";

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: INVITATION_ID,
    email: "player@example.com",
    invitedByUserId: USER_ID,
    acceptedByUserId: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 1_000),
    acceptedAt: null,
    ...overrides,
  };
}

// The repository is a class (nominal because of its private db field), so
// method-level stubs need the double cast.
function repositoryStub(methods: Partial<Record<keyof InvitationRepository, unknown>>) {
  return methods as unknown as InvitationRepository;
}

describe("InvitationService", () => {
  describe("create", () => {
    it("stamps expiresAt one configured TTL into the future", async () => {
      const created: NewInvitation[] = [];
      const service = new InvitationService(
        repositoryStub({
          create: async (input: NewInvitation) => {
            created.push(input);
            return invitation({ email: input.email, expiresAt: input.expiresAt });
          },
        }),
      );

      const before = Date.now();
      await service.create({ email: "player@example.com", invitedByUserId: USER_ID });

      const expiresAt = created[0]?.expiresAt.getTime() ?? 0;
      expect(expiresAt).toBeGreaterThanOrEqual(before + env.INVITATION_TTL_MS);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + env.INVITATION_TTL_MS);
    });
  });

  describe("markAccepted", () => {
    it("throws INVITATION_NOT_FOUND when no row matches", async () => {
      const service = new InvitationService(repositoryStub({ updateById: async () => null }));

      await expect(
        service.markAccepted(INVITATION_ID, { acceptedByUserId: USER_ID }),
      ).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
    });
  });

  describe("isInvited", () => {
    it("is true for a pending, unexpired invitation", async () => {
      const service = new InvitationService(
        repositoryStub({ findByEmail: async () => invitation() }),
      );

      expect(await service.isInvited("player@example.com")).toBe(true);
    });

    it("is false once the invitation expired", async () => {
      const service = new InvitationService(
        repositoryStub({
          findByEmail: async () => invitation({ expiresAt: new Date(Date.now() - 1_000) }),
        }),
      );

      expect(await service.isInvited("player@example.com")).toBe(false);
    });

    it("is false once the invitation was accepted", async () => {
      const service = new InvitationService(
        repositoryStub({ findByEmail: async () => invitation({ acceptedAt: new Date() }) }),
      );

      expect(await service.isInvited("player@example.com")).toBe(false);
    });
  });
});
