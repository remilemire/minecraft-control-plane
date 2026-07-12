// packages/shared/src/features/minecraft/players/minecraft-players.schemas.test.ts

import { describe, expect, it } from "vitest";
import { minecraftUsernameSchema } from "./minecraft-players.schemas.js";

describe("minecraftUsernameSchema", () => {
  it("accepts letters, digits, and underscores", () => {
    expect(minecraftUsernameSchema.safeParse("Notch_99").success).toBe(true);
  });

  it("rejects empty strings and disallowed characters", () => {
    for (const value of ["", "bad-name", "has space", "emoji😀"]) {
      expect(minecraftUsernameSchema.safeParse(value).success, value).toBe(false);
    }
  });

  it("rejects usernames shorter than 3 or longer than 16 characters", () => {
    for (const value of ["ab", "a".repeat(17)]) {
      expect(minecraftUsernameSchema.safeParse(value).success, value).toBe(false);
    }
  });
});
