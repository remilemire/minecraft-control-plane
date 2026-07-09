// apps/backend/src/features/invitations/invitations.errors.ts

import { DomainError } from "@/errors/base-errors.js";

export class InvitationNotFoundError extends DomainError {
  public constructor(message = "Invitation not found.", options?: ErrorOptions) {
    super(message, options);
  }
}
