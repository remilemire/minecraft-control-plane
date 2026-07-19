// apps/backend/src/errors/catalog-contracts.ts

import type { ErrorCode } from "@minecraft-server/shared/errors";

export type ErrorCatalog<Code extends ErrorCode = ErrorCode> = {
  readonly [C in Code]: {
    readonly message: string;
  };
};
