// apps/backend/test/api/invitations.api.test.ts

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/create-test-app.js";
import { createInvitation } from "../helpers/factories/invitation.factory.js";
import { authenticateAdmin, authenticateUser } from "../helpers/test-auth.js";
import { csrfPair } from "../helpers/test-cookies.js";

const { app } = createTestApp();

describe("GET /api/invitations", () => {
  it("rejects requests without a session", async () => {
    const response = await request(app).get("/api/invitations");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ kind: "UNAUTHORIZED", code: "UNAUTHENTICATED" });
  });

  it("rejects non-admin users", async () => {
    const auth = await authenticateUser();

    const response = await request(app).get("/api/invitations").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ kind: "FORBIDDEN", code: "ADMIN_REQUIRED" });
  });

  it("lists invitations for the admin", async () => {
    const auth = await authenticateAdmin();
    const invitation = await createInvitation({ email: "steve@example.com" });

    const response = await request(app).get("/api/invitations").set("Cookie", [auth.cookie]);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: invitation.id, email: "steve@example.com" });
    // The response schema strips internal fields.
    expect(response.body[0].invitedByUserId).toBeUndefined();
  });
});

describe("POST /api/invitations", () => {
  it("rejects mutations without the CSRF pair", async () => {
    const auth = await authenticateAdmin();

    const response = await request(app)
      .post("/api/invitations")
      .set("Cookie", [auth.cookie])
      .send({ email: "newplayer@example.com" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: "INVALID_CSRF_TOKEN" });
  });

  it("creates an invitation for the admin", async () => {
    const auth = await authenticateAdmin();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/invitations")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ email: "newplayer@example.com" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ email: "newplayer@example.com", acceptedAt: null });
    expect(response.body.id).toBeDefined();
    expect(response.body.expiresAt).toBeDefined();
  });

  it("rejects an invalid email with a validation error", async () => {
    const auth = await authenticateAdmin();
    const csrf = csrfPair();

    const response = await request(app)
      .post("/api/invitations")
      .set("Cookie", [auth.cookie, csrf.cookie])
      .set(csrf.headerName, csrf.headerValue)
      .send({ email: "not-an-email" });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
    expect(response.body.issues).toEqual([expect.objectContaining({ path: ["email"] })]);
  });
});
