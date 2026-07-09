// apps/backend/src/features/minecraft/minecraft.errors.ts

import { DomainError, InfrastructureError } from "@/errors/base-errors.js";

export class MinecraftProfileNotFoundError extends DomainError {
  public constructor(message = "Minecraft profile not found.", options?: ErrorOptions) {
    super(message, options);
  }
}

export class MojangProfileNotFoundError extends DomainError {
  public constructor(message = "Mojang profile not found.", options?: ErrorOptions) {
    super(message, options);
  }
}

export class MojangClientError extends InfrastructureError {}

export class RconClientError extends InfrastructureError {}
