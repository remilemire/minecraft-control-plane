// packages/shared/src/features/minecraft/profiles/minecraft-profiles.schemas.test.ts

import { describe, expect, it } from "vitest";
import { minecraftUsernameSchema } from "./minecraft-profiles.schemas.js";

describe("minecraftUsernameSchema", () => {
  it("accepts letters, digits, and underscores", () => {
    expect(minecraftUsernameSchema.safeParse("Notch_99").success).toBe(true);
  });

  it("rejects empty strings and disallowed characters", () => {
    for (const value of ["", "bad-name", "has space", "emoji😀"]) {
      expect(minecraftUsernameSchema.safeParse(value).success, value).toBe(false);
    }
  });
});
