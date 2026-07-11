// packages/shared/src/common/schemas.test.ts

import { describe, expect, it } from "vitest";
import { emailSchema } from "./schemas.js";

describe("emailSchema", () => {
  it("normalizes a valid email to lowercase", () => {
    expect(emailSchema.parse("Foo@Example.COM")).toBe("foo@example.com");
  });

  it("trims surrounding whitespace before validating", () => {
    expect(emailSchema.parse("  Foo@Example.COM  ")).toBe("foo@example.com");
  });

  it("rejects a value that isn't an email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects a whitespace-only value", () => {
    expect(emailSchema.safeParse("   ").success).toBe(false);
  });
});
