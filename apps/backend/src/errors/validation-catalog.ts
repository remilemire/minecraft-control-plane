// apps/backend/src/errors/validation-catalog.ts

import type { PrimitiveScalar } from "@/lib/types.js";
import type { MessageFactory, ValidationCatalog } from "./types.js";

export const VALIDATION_CATALOG = {
  EXTRA_FIELD: { createMessage: () => "This field isn't allowed." },
  MISSING_FIELD: { createMessage: () => "This field is required." },
  BOOLEAN_TYPE: { createMessage: () => "Enter true or false." },
  STRING_TYPE: { createMessage: () => "Enter valid text." },
  INTEGER_TYPE: { createMessage: () => "Enter a whole number." },
  DECIMAL_TYPE: { createMessage: () => "Enter a valid number." },
  OBJECT_TYPE: { createMessage: () => "Enter a valid object or list." },
  TOO_SMALL: {
    createMessage: (ctx?: { minValue?: number }) =>
      ctx?.minValue !== undefined ? `Must be greater than ${ctx.minValue}.` : "Too small.",
  },
  TOO_LARGE: {
    createMessage: (ctx?: { maxValue?: number }) =>
      ctx?.maxValue !== undefined ? `Must be less than ${ctx.maxValue}.` : "Too big.",
  },
  TOO_SHORT: {
    createMessage: (ctx?: { minLength?: number }) =>
      ctx?.minLength !== undefined ? `Minimum ${ctx.minLength} characters required.` : "Too short.",
  },
  TOO_LONG: {
    createMessage: (ctx?: { maxLength?: number }) =>
      ctx?.maxLength !== undefined ? `Maximum ${ctx.maxLength} characters allowed.` : "Too long.",
  },
  INVALID_OPTION: {
    createMessage: (ctx?: { allowedValues?: PrimitiveScalar[] }) =>
      ctx?.allowedValues !== undefined
        ? `Choose from: ${ctx.allowedValues.join(" | ")}.`
        : "Choose one of the allowed values.",
  },
  INVALID_MULTIPLE: {
    createMessage: (ctx?: { multipleOf?: number }) =>
      ctx?.multipleOf !== undefined
        ? `Must be a multiple of ${ctx.multipleOf}.`
        : "Enter a valid multiple.",
  },
  INVALID_VALUE: { createMessage: () => "Invalid value." },
} as const satisfies ValidationCatalog;

export type ValidationCode = keyof typeof VALIDATION_CATALOG;

export type ValidationIssue = {
  readonly code: ValidationCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
};

export type ValidationIssueInput = {
  readonly [Code in ValidationCode]: {
    readonly code: Code;
    readonly message?: string;
    readonly path: readonly (string | number)[];
  } & (ContextForCode<Code> extends never
    ? unknown
    : {
        readonly ctx?: ContextForCode<Code>;
      });
}[ValidationCode];

export function createValidationIssue(input: ValidationIssueInput): ValidationIssue {
  const createMessage: MessageFactory = VALIDATION_CATALOG[input.code]["createMessage"];
  return {
    ...input,
    message: input.message ?? ("ctx" in input ? createMessage(input.ctx) : createMessage()),
  };
}

type ContextForCode<Code extends ValidationCode> = ContextForMessageFactory<
  (typeof VALIDATION_CATALOG)[Code]["createMessage"]
>;

type ContextForMessageFactory<Factory> = Factory extends (...args: infer Args) => string
  ? Args extends []
    ? never
    : Exclude<Args[0], undefined>
  : never;
