// apps/backend/src/features/minecraft/clients/mojang.client.test.ts

// Unit-testing the real client means stubbing global fetch (vi.stubGlobal).

import { randomUUID } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MojangClient } from "./mojang.client.js";

interface FakeResponseInit {
  readonly status: number;
  readonly ok?: boolean;
  readonly json?: () => Promise<unknown>;
}

function fakeResponse({ status, ok, json }: FakeResponseInit): Response {
  return {
    status,
    ok: ok ?? (status >= 200 && status < 300),
    json: json ?? (async () => ({})),
  } as unknown as Response;
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MojangClient", () => {
  const client = new MojangClient();

  it("returns the profile for a known username", async () => {
    const id = randomUUID();
    const fetchMock = stubFetch(
      fakeResponse({ status: 200, json: async () => ({ id, name: "Steve" }) }),
    );

    expect(await client.findByUsername("Steve")).toEqual({ uuid: id, username: "Steve" });
    // The username is path-escaped in the request URL.
    expect(fetchMock).toHaveBeenCalledWith("https://api.mojang.com/users/profiles/minecraft/Steve");
  });

  it("returns null on a 404 response", async () => {
    stubFetch(fakeResponse({ status: 404, ok: false }));

    expect(await client.findByUsername("Ghost")).toBeNull();
  });

  it("returns null on a 202 response", async () => {
    stubFetch(fakeResponse({ status: 202, ok: true }));

    expect(await client.findByUsername("Pending")).toBeNull();
  });

  it("throws MOJANG_CLIENT_ERROR on other non-ok statuses", async () => {
    stubFetch(fakeResponse({ status: 500, ok: false }));

    await expect(client.findByUsername("Steve")).rejects.toMatchObject({
      code: "MOJANG_CLIENT_ERROR",
    });
  });

  it("throws MOJANG_CLIENT_ERROR when the response shape is unexpected", async () => {
    // id is not a uuid, so the account schema rejects it.
    stubFetch(fakeResponse({ status: 200, json: async () => ({ id: "nope", name: "Steve" }) }));

    await expect(client.findByUsername("Steve")).rejects.toMatchObject({
      code: "MOJANG_CLIENT_ERROR",
    });
  });

  it("escapes special characters in the username", async () => {
    const fetchMock = stubFetch(fakeResponse({ status: 404, ok: false }));

    await client.findByUsername("a b/c");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mojang.com/users/profiles/minecraft/a%20b%2Fc",
    );
  });
});
