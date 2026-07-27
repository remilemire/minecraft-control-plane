// apps/backend/src/middleware/error-handler.test.ts

import { AppError } from "@/errors/index.js";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler.js";

// The real env is parsed once at import with APP_ENV=dev (setup-env.ts), so
// the prod logging branch is only reachable through a mock.
const envState = { DEBUG: false };

vi.mock("@/config/env.js", () => ({
  env: {
    get DEBUG() {
      return envState.DEBUG;
    },
  },
}));

function createRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function handle(error: unknown, res: Response): void {
  errorHandler(error, {} as Request, res, vi.fn() as NextFunction);
}

describe("errorHandler", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("translates an AppError into its JSON envelope", () => {
    const res = createRes();

    handle(new AppError("ROUTE_NOT_FOUND"), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "NOT_FOUND", code: "ROUTE_NOT_FOUND" }),
    );
  });

  it("logs server errors even with debug off", () => {
    envState.DEBUG = false;
    const error = new Error("boom");

    handle(error, createRes());

    expect(errorSpy).toHaveBeenCalledWith(error);
  });

  it("stays quiet on expected errors with debug off", () => {
    envState.DEBUG = false;

    handle(new AppError("ROUTE_NOT_FOUND"), createRes());

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs every error with debug on", () => {
    envState.DEBUG = true;

    handle(new AppError("ROUTE_NOT_FOUND"), createRes());

    expect(errorSpy).toHaveBeenCalled();
  });
});
