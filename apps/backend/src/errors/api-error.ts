// apps/backend/src/errors/api-error.ts

export type ApiErrorStatus = 401 | 403 | 404 | 409 | 422 | 500 | 502;

export type ValidationIssue = {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
};

export type ErrorResponse = {
  readonly status: ApiErrorStatus;
  readonly body: {
    readonly code: string;
    readonly message: string;
    readonly issues?: readonly ValidationIssue[];
  };
};

export interface ApiErrorOptions {
  readonly status: ApiErrorStatus;
  readonly code: string;
  readonly message: string;
  readonly issues?: readonly ValidationIssue[];
  readonly cause?: unknown;
}

/**
 * The only error that reaches the HTTP layer. Never thrown by features:
 * translators (`errors/translators/`) build it from domain/infrastructure
 * errors, and the error-handler middleware serializes it via `toResponse()`.
 */
export class ApiError extends Error {
  public readonly status: ApiErrorStatus;
  public readonly code: string;
  public readonly issues?: readonly ValidationIssue[];

  public constructor({ status, code, message, issues, cause }: ApiErrorOptions) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;

    if (issues !== undefined) {
      this.issues = issues;
    }
  }

  public toResponse(): ErrorResponse {
    return {
      status: this.status,
      body: {
        code: this.code,
        message: this.message,
        ...(this.issues !== undefined ? { issues: this.issues } : {}),
      },
    };
  }
}
