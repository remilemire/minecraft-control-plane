// packages/shared/src/errors.ts

import z from "zod";
import {
  commonErrorMeta,
  errorKindSchema,
  type ErrorMeta,
  type ErrorKind,
} from "./common/index.js";
import { authClientErrorMeta, authErrorMeta, sessionErrorMeta } from "./features/auth/index.js";
import { invitationErrorMeta } from "./features/invitations/index.js";
import {
  minecraftClientErrorMeta,
  minecraftProfileErrorMeta,
  minecraftServerErrorMeta,
} from "./features/minecraft/index.js";
import { userErrorMeta } from "./features/users/index.js";

export const errorMeta = {
  ...commonErrorMeta,
  ...authErrorMeta,
  ...authClientErrorMeta,
  ...sessionErrorMeta,
  ...invitationErrorMeta,
  ...minecraftProfileErrorMeta,
  ...minecraftServerErrorMeta,
  ...minecraftClientErrorMeta,
  ...userErrorMeta,
} as const satisfies ErrorMeta;

export type ErrorCode = keyof typeof errorMeta;

export type ErrorCodeForKind<K extends ErrorKind> = {
  [C in ErrorCode]: (typeof errorMeta)[C]["kind"] extends K ? C : never;
}[ErrorCode];

export const errorCodeSchema = z.enum(Object.keys(errorMeta) as [ErrorCode, ...ErrorCode[]]);

export const validationIssueCodeSchema = z.enum([
  "EXTRA_FIELD",
  "MISSING_FIELD",
  "BOOLEAN_TYPE",
  "STRING_TYPE",
  "INTEGER_TYPE",
  "DECIMAL_TYPE",
  "OBJECT_TYPE",
  "TOO_SMALL",
  "TOO_LARGE",
  "TOO_SHORT",
  "TOO_LONG",
  "INVALID_OPTION",
  "INVALID_MULTIPLE",
  "INVALID_VALUE",
]);

export type ValidationIssueCode = z.infer<typeof validationIssueCodeSchema>;

export const validationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.array(z.union([z.string(), z.number(), z.symbol()])),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const errorResponseSchema = z.object({
  kind: errorKindSchema,
  code: errorCodeSchema,
  message: z.string(),
  issues: z.array(validationIssueSchema).min(1).exactOptional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
