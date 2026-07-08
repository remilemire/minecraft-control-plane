// apps/backend/src/features/minecraft/minecraft.errors.ts

export abstract class MinecraftClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class MojangClientError extends MinecraftClientError {}

export class RconClientError extends MinecraftClientError {}
