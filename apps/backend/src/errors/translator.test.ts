// apps/backend/src/errors/translator.test.ts

import { describe, expect, it } from "vitest";
import { AppError } from "./app-error.js";
import { errorCatalog } from "./catalog.js";
import { translateError } from "./translator.js";
import { ValidationError } from "./validation-error.js";

describe("translateError", () => {
  it("maps an AppError to its catalog kind, status, and message", () => {
    const result = translateError(new AppError("MINECRAFT_PROFILE_NOT_FOUND"));

    expect(result).toEqual({
      status: 404,
      body: {
        kind: "NOT_FOUND",
        code: "MINECRAFT_PROFILE_NOT_FOUND",
        message: errorCatalog.MINECRAFT_PROFILE_NOT_FOUND.message,
      },
    });
  });

  it("uses the catalog message, not the AppError's own message override", () => {
    // The wire message is stable per code; internal overrides stay server-side.
    const result = translateError(new AppError("INTERNAL", { message: "stack trace details" }));

    expect(result.status).toBe(500);
    expect(result.body.message).toBe(errorCatalog.INTERNAL.message);
    expect(result.body.message).not.toBe("stack trace details");
  });

  it("maps a ValidationError to 422 with normalized issues", () => {
    const result = translateError(
      new ValidationError([
        { code: "MISSING_FIELD", path: ["email"] },
        { code: "TOO_SHORT", path: ["password"], ctx: { minLength: 8 } },
      ]),
    );

    expect(result.status).toBe(422);
    expect(result.body).toMatchObject({ kind: "VALIDATION", code: "VALIDATION_FAILED" });
    expect(result.body.issues).toEqual([
      { code: "MISSING_FIELD", path: ["email"], message: "This field is required." },
      {
        code: "TOO_SHORT",
        path: ["password"],
        message: "Minimum 8 characters required.",
      },
    ]);
  });

  it("falls back to INTERNAL for unknown errors", () => {
    for (const thrown of [new Error("boom"), "just a string", undefined, { random: true }]) {
      const result = translateError(thrown);

      expect(result.status).toBe(500);
      expect(result.body).toMatchObject({ kind: "INTERNAL", code: "INTERNAL" });
      expect(result.body.issues).toBeUndefined();
    }
  });
});
