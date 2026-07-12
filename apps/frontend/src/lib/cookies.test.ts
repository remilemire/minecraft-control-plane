// apps/frontend/src/lib/cookies.test.ts

import { beforeEach, describe, expect, it } from "vitest";
import { readCookie } from "./cookies";

function clearCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name !== undefined && name !== "") {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }
}

describe("readCookie", () => {
  beforeEach(clearCookies);

  it("reads a cookie by name", () => {
    document.cookie = "csrf_token=abc123";
    document.cookie = "other=value";

    expect(readCookie("csrf_token")).toBe("abc123");
    expect(readCookie("other")).toBe("value");
  });

  it("returns null when the cookie is missing", () => {
    expect(readCookie("csrf_token")).toBeNull();
  });

  it("decodes URI-encoded values", () => {
    document.cookie = `token=${encodeURIComponent("a=b c")}`;

    expect(readCookie("token")).toBe("a=b c");
  });
});
