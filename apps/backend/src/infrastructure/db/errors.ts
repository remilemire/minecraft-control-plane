// apps/backend/src/infrastructure/db/errors.ts

import { AppError } from "@/errors/app-error.js";
import type { ErrorCode } from "@minecraft-server/shared/errors";
import { DatabaseError } from "pg";

// SQLSTATE classes where the database could not do the work at all: it was
// unreachable (08), out of resources (53), or shutting down / cancelling
// (57). Those are outages rather than bugs, so they answer 503 instead of
// masquerading as an INTERNAL 500.
const UNAVAILABLE_SQLSTATE_CLASSES = new Set(["08", "53", "57"]);

// Socket-level failures never reach Postgres, so they carry a node errno
// instead of a SQLSTATE.
const UNAVAILABLE_ERRNOS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

// Drizzle wraps driver failures in a `DrizzleQueryError`, and a rolled-back
// transaction can wrap that again, so the pg error sits at an unpredictable
// depth. Walking the chain keeps the mapping working regardless of how many
// layers a given call path adds. The `seen` guard makes a self-referential
// cause (which would otherwise spin forever) terminate.
function* causeChain(error: unknown): Generator<unknown> {
  const seen = new Set<unknown>();
  let current = error;

  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    yield current;
    current = current instanceof Error ? current.cause : undefined;
  }
}

function socketErrno(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : undefined;
}

export async function withDbErrors<T>(
  operation: () => Promise<T>,
  constraintErrors: {
    readonly [constraint: string]: ErrorCode;
  } = {},
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // A domain failure raised inside the operation is already the answer;
    // only driver-level failures are ours to translate. Without this, an
    // AppError thrown by a nested call would be reburied as INTERNAL.
    if (error instanceof AppError) {
      throw error;
    }

    for (const link of causeChain(error)) {
      if (link instanceof DatabaseError) {
        const mapped =
          link.constraint !== undefined ? constraintErrors[link.constraint] : undefined;
        if (mapped !== undefined) {
          throw new AppError(mapped, { cause: error });
        }

        if (link.code !== undefined && UNAVAILABLE_SQLSTATE_CLASSES.has(link.code.slice(0, 2))) {
          throw new AppError("SERVICE_UNAVAILABLE", { cause: error });
        }
      } else {
        const errno = socketErrno(link);
        if (errno !== undefined && UNAVAILABLE_ERRNOS.has(errno)) {
          throw new AppError("SERVICE_UNAVAILABLE", { cause: error });
        }
      }
    }

    // An unmapped constraint violation lands here too: the query was wrong
    // (or a constraint gained a meaning nobody mapped), which is a bug.
    throw new AppError("INTERNAL", { cause: error });
  }
}
