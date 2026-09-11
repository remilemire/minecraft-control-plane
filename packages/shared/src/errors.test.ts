// packages/shared/src/errors.test.ts

import { describe, expect, it } from "vitest";
import { commonErrorMeta, errorKindSchema } from "./common/index.js";
import { authErrorMeta, sessionErrorMeta } from "./features/auth/index.js";
import {
  minecraftClientErrorMeta,
  minecraftProfileErrorMeta,
  minecraftServerErrorMeta,
  minecraftBackupErrorMeta,
} from "./features/minecraft/index.js";
import { userErrorMeta } from "./features/users/index.js";
import { errorMeta, errorCodeSchema, errorResponseSchema } from "./errors.js";

// The per-feature metadata maps that errors.ts spreads into the aggregate. A
// duplicate code across two features would be silently overwritten by the
// spread with no type error — only a runtime check catches that.
const featureMetas = {
  common: commonErrorMeta,
  auth: authErrorMeta,
  session: sessionErrorMeta,
  minecraftProfile: minecraftProfileErrorMeta,
  minecraftServer: minecraftServerErrorMeta,
  minecraftBackup: minecraftBackupErrorMeta,
  minecraftClient: minecraftClientErrorMeta,
  user: userErrorMeta,
};

describe("errorMeta", () => {
  it("merges every feature's metadata without dropping codes to collisions", () => {
    const codesPerFeature = Object.values(featureMetas).reduce<number>(
      (total, meta) => total + Object.keys(meta).length,
      0,
    );

    // If two features declared the same code, the spread would collapse them
    // and the aggregate would be shorter than the sum of its parts.
    expect(Object.keys(errorMeta)).toHaveLength(codesPerFeature);
  });

  it("has entries and gives every one a known error kind", () => {
    expect(Object.keys(errorMeta).length).toBeGreaterThan(0);

    for (const [code, entry] of Object.entries(errorMeta)) {
      expect(errorKindSchema.safeParse(entry.kind).success, `kind for ${code}`).toBe(true);
    }
  });
});

describe("errorCodeSchema", () => {
  it("enumerates exactly the metadata's codes", () => {
    expect([...errorCodeSchema.options].sort()).toEqual(Object.keys(errorMeta).sort());
  });

  it("rejects a code that isn't in the metadata", () => {
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
