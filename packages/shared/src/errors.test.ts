// packages/shared/src/errors.test.ts

import { describe, expect, it } from "vitest";
import { errorKindSchema } from "./common/index.js";
import { commonErrorCatalog } from "./common/errors.js";
import { authErrorCatalog } from "./features/auth/index.js";
import { invitationErrorCatalog } from "./features/invitations/index.js";
import {
  minecraftClientErrorCatalog,
  minecraftProfileErrorCatalog,
  minecraftServerErrorCatalog,
} from "./features/minecraft/index.js";
import { sessionErrorCatalog } from "./features/sessions/index.js";
import { userErrorCatalog } from "./features/users/index.js";
import { errorCatalog, errorCodeSchema, errorResponseSchema } from "./errors.js";

// The per-feature catalogs that errors.ts spreads into the aggregate. A
// duplicate code across two features would be silently overwritten by the
// spread with no type error — only a runtime check catches that.
const featureCatalogs = {
  common: commonErrorCatalog,
  auth: authErrorCatalog,
  invitation: invitationErrorCatalog,
  minecraftProfile: minecraftProfileErrorCatalog,
  minecraftServer: minecraftServerErrorCatalog,
  minecraftClient: minecraftClientErrorCatalog,
  session: sessionErrorCatalog,
  user: userErrorCatalog,
};

describe("errorCatalog", () => {
  it("merges every feature catalog without dropping codes to collisions", () => {
    const codesPerFeature = Object.values(featureCatalogs).reduce(
      (total, catalog) => total + Object.keys(catalog).length,
      0,
    );

    // If two features declared the same code, the spread would collapse them
    // and the aggregate would be shorter than the sum of its parts.
    expect(Object.keys(errorCatalog)).toHaveLength(codesPerFeature);
  });

  it("has entries and gives every one a known error kind", () => {
    expect(Object.keys(errorCatalog).length).toBeGreaterThan(0);

    for (const [code, entry] of Object.entries(errorCatalog)) {
      expect(errorKindSchema.safeParse(entry.kind).success, `kind for ${code}`).toBe(true);
    }
  });
});

describe("errorCodeSchema", () => {
  it("enumerates exactly the catalog's codes", () => {
    expect([...errorCodeSchema.options].sort()).toEqual(Object.keys(errorCatalog).sort());
  });

  it("rejects a code that isn't in the catalog", () => {
    expect(errorCodeSchema.safeParse("NOT_A_REAL_CODE").success).toBe(false);
  });
});

describe("errorResponseSchema", () => {
  it("accepts a well-formed error, with and without issues", () => {
    expect(
      errorResponseSchema.safeParse({
        kind: "NOT_FOUND",
        code: "USER_NOT_FOUND",
        message: "User not found",
      }).success,
    ).toBe(true);

    expect(
      errorResponseSchema.safeParse({
        kind: "VALIDATION",
        code: "VALIDATION_FAILED",
        message: "Invalid input",
        issues: [{ code: "MISSING_FIELD", message: "Required", path: ["email"] }],
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown code and an empty issues array", () => {
    expect(
      errorResponseSchema.safeParse({
        kind: "NOT_FOUND",
        code: "NOPE",
        message: "x",
      }).success,
    ).toBe(false);

    // issues is optional, but when present it must hold at least one entry.
    expect(
      errorResponseSchema.safeParse({
        kind: "VALIDATION",
        code: "VALIDATION_FAILED",
        message: "x",
        issues: [],
      }).success,
    ).toBe(false);
  });
});
