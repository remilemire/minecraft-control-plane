// apps/backend/src/errors/base-errors.ts

/**
 * Base for errors that represent a business-rule outcome (not found, not
 * allowed, ...). Messages are user-facing: translators pass them through
 * to the API response as-is.
 */
export abstract class DomainError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * Base for errors raised by external systems (database, Mojang, RCON, ...).
 * Messages may contain internal detail: translators replace them with a safe
 * generic message and keep the original error as `cause`.
 */
export abstract class InfrastructureError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
