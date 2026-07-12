// apps/frontend/src/lib/apiClient.test.ts

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import { ApiError, apiRequest, toApiError } from "./apiClient";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiRequest", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = "csrf_token=csrf-value";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("parses a successful response with the given schema", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { name: "Steve" }));

    const result = await apiRequest("GET", "/thing", {
      schema: z.object({ name: z.string() }),
    });

    expect(result).toEqual({ name: "Steve" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/thing",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("does not attach a CSRF header to GET requests", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest("GET", "/thing", { schema: z.object({}) });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("x-csrf-token")).toBeNull();
  });

  it("echoes the CSRF cookie on mutations and serializes the body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await apiRequest("POST", "/thing", { body: { a: 1 } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(url).toBe("/api/thing");
    expect(headers.get("x-csrf-token")).toBe("csrf-value");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("returns undefined for 204 responses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(apiRequest("POST", "/thing")).resolves.toBeUndefined();
  });

  it("throws an ApiError built from the error body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { kind: "FORBIDDEN", code: "NOT_INVITED", message: "Not invited." }),
    );

    const error = await apiRequest("GET", "/thing", { schema: z.object({}) }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      kind: "FORBIDDEN",
      code: "NOT_INVITED",
      message: "Not invited.",
    });
  });

  it("preserves validation issues from the error body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        kind: "VALIDATION",
        code: "VALIDATION_FAILED",
        message: "Validation failed.",
        issues: [{ code: "TOO_SHORT", message: "Too short.", path: ["username"] }],
      }),
    );

    const error = (await apiRequest("PUT", "/thing", { schema: z.object({}) }).catch(
      (caught: unknown) => caught,
    )) as ApiError;

    expect(error.issues).toEqual([
      { code: "TOO_SHORT", message: "Too short.", path: ["username"] },
    ]);
  });

  it("falls back to INTERNAL when the error body is unrecognizable", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));

    const error = await apiRequest("GET", "/thing", { schema: z.object({}) }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ kind: "INTERNAL", code: "INTERNAL" });
  });

  it("maps network failures to SERVICE_UNAVAILABLE", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const error = await apiRequest("GET", "/thing", { schema: z.object({}) }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ kind: "SERVICE_UNAVAILABLE", code: "SERVICE_UNAVAILABLE" });
  });
});

describe("toApiError", () => {
  it("passes ApiError through untouched", () => {
    const original = new ApiError("CONFLICT", "EMAIL_TAKEN", "Taken.");

    expect(toApiError(original)).toBe(original);
  });

  it("wraps unknown errors as SERVICE_UNAVAILABLE", () => {
    expect(toApiError(new Error("boom"))).toMatchObject({
      kind: "SERVICE_UNAVAILABLE",
      code: "SERVICE_UNAVAILABLE",
    });
  });
});
