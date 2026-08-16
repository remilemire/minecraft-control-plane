// apps/frontend/src/lib/apiClient.ts

import type { ErrorKind } from "@minecraft-control-plane/shared/common";
import {
  errorResponseSchema,
  type ErrorCode,
  type ValidationIssue,
} from "@minecraft-control-plane/shared/errors";
import type { ZodType } from "zod";
import { readCookie } from "./cookies";

// Mirrors the backend's http/csrf constants (double-submit pattern).
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

export const API_BASE = "/api";

export class ApiError extends Error {
  public readonly kind: ErrorKind;
  public readonly code: ErrorCode;
  public readonly issues: ValidationIssue[] | undefined;

  public constructor(
    kind: ErrorKind,
    code: ErrorCode,
    message: string,
    issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.code = code;
    this.issues = issues;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  return new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "Could not reach the server.");
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions<T> {
  schema?: ZodType<T>;
  body?: unknown;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  const parsed = errorResponseSchema.safeParse(await response.json().catch(() => null));

  if (!parsed.success) {
    return new ApiError("INTERNAL", "INTERNAL", "Something went wrong.");
  }

  const { kind, code, message, issues } = parsed.data;
  return new ApiError(kind, code, message, issues);
}

export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  options: RequestOptions<T> & { schema: ZodType<T> },
): Promise<T>;
export async function apiRequest(
  method: HttpMethod,
  path: string,
  options?: RequestOptions<never>,
): Promise<undefined>;
export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  { schema, body }: RequestOptions<T> = {},
): Promise<T | undefined> {
  const headers = new Headers();

  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  // Mutations must echo the readable CSRF cookie back as a header.
  if (method !== "GET") {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken !== null) {
      headers.set(CSRF_HEADER, csrfToken);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("SERVICE_UNAVAILABLE", "SERVICE_UNAVAILABLE", "Could not reach the server.");
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  if (schema === undefined || response.status === 204) {
    return undefined;
  }

  return schema.parse(await response.json());
}
