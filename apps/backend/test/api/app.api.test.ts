// apps/backend/test/api/app.api.test.ts

// App-shell behavior that belongs to no single feature.

import { errorResponseSchema } from "@minecraft-control-plane/shared/errors";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "@test/helpers/create-test-app.js";

const { app } = createTestApp();

describe("unmatched /api paths", () => {
  it("returns the ROUTE_NOT_FOUND envelope instead of Express's HTML 404", async () => {
    const response = await request(app).get("/api/nope");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: "NOT_FOUND", code: "ROUTE_NOT_FOUND" });
    // The envelope must parse with the shared schema the frontend uses.
    expect(errorResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it("covers unmatched methods on known paths too", async () => {
    const response = await request(app).patch("/api/users");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });
});
