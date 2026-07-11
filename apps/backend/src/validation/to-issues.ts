// apps/backend/src/validation/to-issues.ts

import type { PrimitiveScalar } from "@/lib/types.js";
import type { ValidationIssueData } from "@/errors/validation-issues.js";
import type z from "zod";

export function toIssues(error: z.ZodError): ValidationIssueData[] {
  return error.issues.flatMap(toIssue);
}

function toIssue(issue: z.core.$ZodIssue): ValidationIssueData[] {
  const path = issue.path;

  switch (issue.code) {
    case "invalid_type":
      return [issue.input === undefined ? { code: "MISSING_FIELD", path } : toTypeIssue(issue)];
    case "too_small":
      return [toTooSmallIssue(issue)];
    case "too_big":
      return [toTooBigIssue(issue)];
    case "not_multiple_of":
      return [{ code: "INVALID_MULTIPLE", path, ctx: { multipleOf: issue.divisor } }];
    case "invalid_value":
      return [{ code: "INVALID_OPTION", path, ctx: { allowedValues: toScalars(issue.values) } }];
    case "unrecognized_keys":
      return issue.keys.map((key) => ({ code: "EXTRA_FIELD", path: [...path, key] }));
    case "invalid_format":
    case "invalid_union":
    case "invalid_key":
    case "invalid_element":
    case "custom":
    default:
      return [{ code: "INVALID_VALUE", path }];
  }
}

function toTypeIssue(issue: z.core.$ZodIssueInvalidType): ValidationIssueData {
  const path = issue.path;

  switch (issue.expected) {
    case "boolean":
      return { code: "BOOLEAN_TYPE", path };
    case "string":
      return { code: "STRING_TYPE", path };
    case "int":
    case "bigint":
      return { code: "INTEGER_TYPE", path };
    case "number":
    case "nan":
      return { code: "DECIMAL_TYPE", path };
    case "object":
    case "record":
    case "map":
    case "set":
    case "tuple":
    case "array":
    case "file":
      return { code: "OBJECT_TYPE", path };
    default:
      return { code: "INVALID_VALUE", path };
  }
}

function toTooSmallIssue(issue: z.core.$ZodIssueTooSmall): ValidationIssueData {
  const path = issue.path;

  switch (issue.origin) {
    case "string":
    case "array":
    case "set":
    case "file":
      return { code: "TOO_SHORT", path, ctx: { minLength: issue.minimum } };
    default:
      return { code: "TOO_SMALL", path, ctx: { minValue: issue.minimum } };
  }
}

function toTooBigIssue(issue: z.core.$ZodIssueTooBig): ValidationIssueData {
  const path = issue.path;

  switch (issue.origin) {
    case "string":
    case "array":
    case "set":
    case "file":
      return { code: "TOO_LONG", path, ctx: { maxLength: issue.maximum } };
    default:
      return { code: "TOO_LARGE", path, ctx: { maxValue: issue.maximum } };
  }
}

function toScalars(values: readonly unknown[]): PrimitiveScalar[] {
  return values.filter(
    (value): value is PrimitiveScalar =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint",
  );
}
