// apps/backend/src/infrastructure/db/errors.test.ts

import { AppError } from "@/errors/app-error.js";
import { DatabaseError } from "pg";
import { describe, expect, it } from "vitest";
import { withDbErrors } from "./errors.js";

const EMAIL_UNIQUE = "users_email_unique";

// A pg driver error as the real driver would raise it: the SQLSTATE in
// `code`, and the violated constraint's name in `constraint`.
function databaseError(overrides: { code?: string; constraint?: string }): DatabaseError {
  return Object.assign(new DatabaseError("db failure", 1, "error"), overrides);
}

// How drizzle presents a driver failure: wrapped, sometimes more than once
// (a rolled-back transaction re-wraps whatever aborted it).
function wrapped(cause: unknown, depth = 1): Error {
  let error = new Error("query failed", { cause });
  for (let i = 1; i < depth; i++) {
    error = new Error("transaction rolled back", { cause: error });
  }
  return error;
}

function failWith(error: unknown): () => Promise<never> {
  return () => Promise.reject(error as Error) as Promise<never>;
}

describe("withDbErrors", () => {
  it("returns the operation's result when it succeeds", async () => {
    expect(await withDbErrors(async () => "ok")).toBe("ok");
  });

  it("maps a violated constraint to its configured error code", async () => {
    const failure = withDbErrors(failWith(wrapped(databaseError({ constraint: EMAIL_UNIQUE }))), {
      [EMAIL_UNIQUE]: "EMAIL_TAKEN",
    });

    await expect(failure).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("finds the driver error however deeply it is wrapped", async () => {
    const failure = withDbErrors(
      failWith(wrapped(databaseError({ constraint: EMAIL_UNIQUE }), 3)),
      {
        [EMAIL_UNIQUE]: "EMAIL_TAKEN",
      },
    );

    await expect(failure).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("rethrows a domain error from the operation instead of reburying it", async () => {
    const failure = withDbErrors(failWith(new AppError("USER_NOT_FOUND")));

    await expect(failure).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("maps an unreachable or shutting-down database to SERVICE_UNAVAILABLE", async () => {
    // 08006 connection_failure, 53300 too_many_connections, 57P03 cannot_connect_now.
    for (const code of ["08006", "53300", "57P03"]) {
      const failure = withDbErrors(failWith(wrapped(databaseError({ code }))));

      await expect(failure).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    }
  });

  it("maps a socket failure to SERVICE_UNAVAILABLE", async () => {
    const failure = withDbErrors(
      failWith(wrapped(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }))),
    );

    await expect(failure).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("falls back to INTERNAL for a constraint nobody mapped", async () => {
    const failure = withDbErrors(
      failWith(wrapped(databaseError({ code: "23505", constraint: "some_other_unique" }))),
      { [EMAIL_UNIQUE]: "EMAIL_TAKEN" },
    );

    await expect(failure).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("falls back to INTERNAL for a failure that is not a database error", async () => {
    const failure = withDbErrors(failWith(new TypeError("undefined is not a function")));

    await expect(failure).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("keeps the original error as the cause so the driver detail survives", async () => {
    const driverError = databaseError({ code: "23505", constraint: EMAIL_UNIQUE });
    const failure = withDbErrors(failWith(wrapped(driverError)), {
      [EMAIL_UNIQUE]: "EMAIL_TAKEN",
    });

    await expect(failure).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
      cause: expect.objectContaining({ cause: driverError }),
    });
  });
});
