// apps/backend/src/errors/validation-issues.ts

import type { PrimitiveScalar } from "@/lib/types.js";
import type { ValidationIssue, ValidationIssueCode } from "@minecraft-control-plane/shared/errors";

export type ValidationIssueCatalog = {
  readonly [C in ValidationIssueCode]: { createMessage: (ctx?: ValidationIssueContext) => string };
};

export type ValidationIssueContext = Readonly<Record<string, PrimitiveScalar | PrimitiveScalar[]>>;

export const validationIssueCatalog = {
  EXTRA_FIELD: { createMessage: () => "This field isn't allowed." },
  MISSING_FIELD: { createMessage: () => "This field is required." },
  BOOLEAN_TYPE: { createMessage: () => "Enter true or false." },
  STRING_TYPE: { createMessage: () => "Enter valid text." },
  INTEGER_TYPE: { createMessage: () => "Enter a whole number." },
  DECIMAL_TYPE: { createMessage: () => "Enter a valid number." },
  OBJECT_TYPE: { createMessage: () => "Enter a valid object or list." },
  TOO_SMALL: {
    createMessage: (ctx?: { minValue?: number | bigint }) =>
      ctx?.minValue !== undefined ? `Must be greater than ${ctx.minValue}.` : "Too small.",
  },
  TOO_LARGE: {
    createMessage: (ctx?: { maxValue?: number | bigint }) =>
      ctx?.maxValue !== undefined ? `Must be less than ${ctx.maxValue}.` : "Too big.",
  },
  TOO_SHORT: {
    createMessage: (ctx?: { minLength?: number | bigint }) =>
      ctx?.minLength !== undefined ? `Minimum ${ctx.minLength} characters required.` : "Too short.",
  },
  TOO_LONG: {
    createMessage: (ctx?: { maxLength?: number | bigint }) =>
      ctx?.maxLength !== undefined ? `Maximum ${ctx.maxLength} characters allowed.` : "Too long.",
  },
  INVALID_OPTION: {
    createMessage: (ctx?: { allowedValues?: PrimitiveScalar[] }) =>
      ctx?.allowedValues !== undefined
        ? `Choose from: ${ctx.allowedValues.join(" | ")}.`
        : "Choose one of the allowed values.",
  },
  INVALID_MULTIPLE: {
    createMessage: (ctx?: { multipleOf?: number | bigint }) =>
      ctx?.multipleOf !== undefined
        ? `Must be a multiple of ${ctx.multipleOf}.`
        : "Enter a valid multiple.",
  },
  INVALID_VALUE: { createMessage: () => "Invalid value." },
} as const satisfies ValidationIssueCatalog;

export type ValidationIssueData = {
  [C in ValidationIssueCode]: ValidationIssueContextForCode<C> extends never
    ? {
        readonly code: C;
        readonly path: (string | number | symbol)[];
      }
    : {
        readonly code: C;
        readonly path: (string | number | symbol)[];
        readonly ctx?: ValidationIssueContextForCode<C>;
      };
}[ValidationIssueCode];

type ValidationIssueContextForCode<C extends ValidationIssueCode> =
  (typeof validationIssueCatalog)[C]["createMessage"] extends (ctx: infer Context) => string
    ? Context extends object
      ? Context
      : never
    : never;

export function normalizeValidationIssue({
  code,
  path,
  ...rest
}: ValidationIssueData): ValidationIssue {
  const fn: ValidationIssueCatalog[ValidationIssueCode]["createMessage"] =
    validationIssueCatalog[code].createMessage;

  return {
    code,
    path,
    message: "ctx" in rest ? fn(rest.ctx) : fn(),
  };
}
