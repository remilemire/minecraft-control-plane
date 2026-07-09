// apps/backend/src/features/auth/auth.errors.ts

import { DomainError } from "@/errors/base-errors.js";

export class UnauthenticatedError extends DomainError {
  public constructor(message = "Authentication required.", options?: ErrorOptions) {
    super(message, options);
  }
}

export class InvalidSessionError extends DomainError {
  public constructor(message = "Invalid or expired session.", options?: ErrorOptions) {
    super(message, options);
  }
}

export class InvalidGoogleCredentialError extends DomainError {
  public constructor(
    message = "The Google credential is invalid or expired.",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class NotInvitedError extends DomainError {
  public constructor(message = "Invite only.", options?: ErrorOptions) {
    super(message, options);
  }
}

export class AdminRequiredError extends DomainError {
  public constructor(
    message = "You do not have permission to perform this action.",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
