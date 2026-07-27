// apps/backend/src/features/minecraft/clients/process.client.test.ts

// Unit-testing the real client means stubbing global fetch (vi.stubGlobal) —
// never reach a real controller in tests.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessClient } from "./process.client.js";

const BASE_URL = "http://minecraft-controller:8000";
const TOKEN = "test-token";

interface FakeResponseInit {
  readonly status: number;
  readonly json?: () => Promise<unknown>;
}

function fakeResponse({ status, json }: FakeResponseInit): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: json ?? (async () => ({})),
  } as unknown as Response;
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastCall(fetchMock: ReturnType<typeof stubFetch>): [URL, RequestInit] {
  return fetchMock.mock.lastCall as [URL, RequestInit];
}

function client() {
  return new ProcessClient({ baseUrl: BASE_URL, token: TOKEN });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProcessClient", () => {
  it.each([
    ["start", "/start"],
    ["stop", "/stop"],
    ["restart", "/restart"],
  ] as const)(
    "%s posts to the controller with the bearer token and a timeout",
    async (method, path) => {
      const fetchMock = stubFetch(fakeResponse({ status: 204 }));

      await client()[method]();

      const [url, init] = lastCall(fetchMock);
      expect(url.href).toBe(`${BASE_URL}${path}`);
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ authorization: `Bearer ${TOKEN}` });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it("throws PROCESS_CLIENT_ERROR when a command does not return 204", async () => {
    stubFetch(fakeResponse({ status: 500 }));

    await expect(client().stop()).rejects.toMatchObject({ code: "PROCESS_CLIENT_ERROR" });
  });

  it("returns the status the controller reports", async () => {
    const fetchMock = stubFetch(
      fakeResponse({ status: 200, json: async () => ({ status: "RUNNING" }) }),
    );

    expect(await client().getStatus()).toBe("RUNNING");

    const [url, init] = lastCall(fetchMock);
    expect(url.href).toBe(`${BASE_URL}/status`);
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ authorization: `Bearer ${TOKEN}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws PROCESS_CLIENT_ERROR when the status request does not return 200", async () => {
    stubFetch(fakeResponse({ status: 401 }));

    await expect(client().getStatus()).rejects.toMatchObject({ code: "PROCESS_CLIENT_ERROR" });
  });

  it("throws PROCESS_CLIENT_ERROR when the status body is unexpected", async () => {
    stubFetch(fakeResponse({ status: 200, json: async () => ({ status: "nope" }) }));

    await expect(client().getStatus()).rejects.toMatchObject({ code: "PROCESS_CLIENT_ERROR" });
  });

  it("throws PROCESS_CLIENT_ERROR when the controller is unreachable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(client().start()).rejects.toMatchObject({ code: "PROCESS_CLIENT_ERROR" });
  });

  it("throws PROCESS_CLIENT_ERROR when the request times out", async () => {
    // AbortSignal.timeout rejects fetch with a DOMException named TimeoutError.
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(client().getStatus()).rejects.toMatchObject({ code: "PROCESS_CLIENT_ERROR" });
  });
});
