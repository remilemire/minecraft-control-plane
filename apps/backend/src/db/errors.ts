// apps/backend/src/db/errors.ts

import { AppError } from "@/errors/app-error.js";
import type { ErrorCode } from "@minecraft-server/shared/errors";
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

// TODO: implement more robust fallbacks
export async function withDbErrors<T>(
  operation: () => Promise<T>,
  constraintErrors: {
    readonly [constraint: string]: ErrorCode;
  } = {},
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof DrizzleQueryError && error?.cause instanceof DatabaseError)) {
      throw new AppError("INTERNAL", { cause: error });
    }

    const { constraint } = error.cause;
    if (constraint !== undefined && constraintErrors[constraint] !== undefined) {
      throw new AppError(constraintErrors[constraint]);
    }

    throw new AppError("INTERNAL", { cause: error });
  }
}
