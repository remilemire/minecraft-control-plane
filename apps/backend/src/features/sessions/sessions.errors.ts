// apps/backend/src/features/sessions/sessions.errors.ts

import { DomainError } from "@/errors/base-errors.js";

export class SessionNotFoundError extends DomainError {
  public constructor(message = "Session not found.", options?: ErrorOptions) {
    super(message, options);
  }
}
