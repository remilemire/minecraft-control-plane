// apps/backend/src/security/csrf.errors.ts

import { DomainError } from "@/errors/base-errors.js";

export class InvalidCsrfTokenError extends DomainError {
  public constructor(message = "Invalid CSRF token.", options?: ErrorOptions) {
    super(message, options);
  }
}
