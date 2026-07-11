// apps/backend/src/errors/meta-types.ts

import type { ErrorCode } from "@minecraft-server/shared/errors";

export type ErrorMeta<Code extends ErrorCode = ErrorCode> = {
  readonly [C in Code]: {
    readonly message: string;
  };
};
