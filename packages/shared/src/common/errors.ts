// packages/shared/src/common/errors.ts

import z from "zod";

export const errorKindSchema = z.enum([
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "INTERNAL",
  "SERVICE_UNAVAILABLE",
]);

export type ErrorKind = z.infer<typeof errorKindSchema>;

export type ErrorCatalog = {
  readonly [code: string]: { readonly kind: ErrorKind };
};

export const commonErrorCatalog = {
  INTERNAL: { kind: "INTERNAL" },
  VALIDATION_FAILED: { kind: "VALIDATION" },
  SERVICE_UNAVAILABLE: { kind: "SERVICE_UNAVAILABLE" },
} as const satisfies ErrorCatalog;

export type CommonErrorCode = keyof typeof commonErrorCatalog;
