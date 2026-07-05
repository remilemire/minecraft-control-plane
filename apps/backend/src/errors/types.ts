// apps/backend/src/errors/types.ts

import type { PrimitiveScalar } from "@/lib/types.js";

export type ErrorCatalog = {
  readonly [code: string]: {
    readonly status: ErrorStatus;
    readonly message: string;
  };
};

export type ValidationCatalog = {
  readonly [rule: string]: { readonly createMessage: (ctx?: ErrorContext) => string };
};

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export type MessageFactory = (ctx?: ErrorContext) => string;

export type ErrorContext = Partial<Record<string, PrimitiveScalar | PrimitiveScalar[]>>;
