// apps/backend/src/features/minecraft/players/players.outbox.ts

// The feature's outbox messages: whitelist commands enqueued in the same
// transaction as the profile write and executed by the OutboxDispatcher after
// commit. Delivery is at-least-once and may run out of enqueue order (retries
// + backoff), so both handlers converge to *current* profile state instead of
// trusting the payload as a snapshot — a stale message becomes a no-op.
import type { MinecraftProfileService } from "@/features/minecraft/profiles/profiles.service.js";
import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import {
  defineOutboxMessage,
  type OutboxHandler,
  type OutboxPayloadOf,
} from "@/infrastructure/outbox/index.js";
import { minecraftUsernameSchema } from "@minecraft-server/shared/minecraft";
import { userIdSchema } from "@minecraft-server/shared/users";
import z from "zod";

export const whitelistAddMessage = defineOutboxMessage({
  type: "minecraft.whitelistAdd",
  payloadSchema: z.strictObject({
    userId: userIdSchema,
    username: minecraftUsernameSchema,
  }),
});

export const whitelistRemoveMessage = defineOutboxMessage({
  type: "minecraft.whitelistRemove",
  payloadSchema: z.strictObject({
    userId: userIdSchema,
    username: minecraftUsernameSchema,
  }),
});

// Aggregated into `outboxMessageDefinitions` (outbox.registry.ts) the way
// schemas/constraints are; computed keys keep the type string written once.
export const minecraftPlayerOutboxMessages = {
  [whitelistAddMessage.type]: whitelistAddMessage,
  [whitelistRemoveMessage.type]: whitelistRemoveMessage,
} as const;

export class WhitelistAddHandler implements OutboxHandler<typeof whitelistAddMessage> {
  public readonly message = whitelistAddMessage;

  public constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftServerService: MinecraftServerService,
  ) {}

  public async handle(payload: OutboxPayloadOf<typeof whitelistAddMessage>): Promise<void> {
    const profile = await this.minecraftProfileService.findByUserId(payload.userId);

    // Unlinked or re-linked to a different name since this was enqueued.
    if (profile === null || profile.username !== payload.username) {
      return;
    }

    await this.minecraftServerService.addToWhitelist(payload.username);
  }
}

export class WhitelistRemoveHandler implements OutboxHandler<typeof whitelistRemoveMessage> {
  public readonly message = whitelistRemoveMessage;

  public constructor(
    private readonly minecraftProfileService: MinecraftProfileService,
    private readonly minecraftServerService: MinecraftServerService,
  ) {}

  public async handle(payload: OutboxPayloadOf<typeof whitelistRemoveMessage>): Promise<void> {
    // Usernames are unique across profiles, so any current owner (the same
    // user re-linking or another user claiming the name) means the whitelist
    // entry must stay.
    const currentOwner = await this.minecraftProfileService.findByUsername(payload.username);

    if (currentOwner !== null) {
      return;
    }

    await this.minecraftServerService.removeFromWhitelist(payload.username);
  }
}
