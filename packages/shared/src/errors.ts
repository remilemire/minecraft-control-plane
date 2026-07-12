// packages/shared/src/errors.ts

import z from "zod";
import {
  commonErrorCatalog,
  errorKindSchema,
  type ErrorCatalog,
  type ErrorKind,
} from "./common/index.js";
import { authErrorCatalog } from "./features/auth/index.js";
import { invitationErrorCatalog } from "./features/invitations/index.js";
import {
  minecraftClientErrorCatalog,
  minecraftProfileErrorCatalog,
  minecraftServerErrorCatalog,
} from "./features/minecraft/index.js";
import { sessionErrorCatalog } from "./features/sessions/index.js";
import { userErrorCatalog } from "./features/users/index.js";

export const errorCatalog = {
  ...commonErrorCatalog,
  ...authErrorCatalog,
  ...invitationErrorCatalog,
  ...minecraftProfileErrorCatalog,
  ...minecraftServerErrorCatalog,
  ...minecraftClientErrorCatalog,
  ...sessionErrorCatalog,
  ...userErrorCatalog,
} as const satisfies ErrorCatalog;

export type ErrorCode = keyof typeof errorCatalog;

export type ErrorCodeForKind<K extends ErrorKind> = {
  [C in ErrorCode]: (typeof errorCatalog)[C]["kind"] extends K ? C : never;
}[ErrorCode];

export const errorCodeSchema = z.enum(Object.keys(errorCatalog) as [ErrorCode, ...ErrorCode[]]);

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
