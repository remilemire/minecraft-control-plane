// apps/backend/src/features/minecraft/profiles/profiles.outbox.ts

// The feature's outbox messages: whitelist commands enqueued in the same
// transaction as the profile write and executed by the OutboxDispatcher after
// commit. Delivery is at-least-once and may run out of enqueue order (retries
// + backoff), so both handlers converge to *current* profile state instead of
// trusting the payload as a snapshot — a stale message becomes a no-op. The
// add handler also owns the profile's `whitelistStatus`: it is the only place
// that knows whether RCON accepted the command, and a profile stays `pending`
// for as long as another attempt is coming — `failed` is written from
// `onDeadLetter`, once the dispatcher has given up for good.
import type { MinecraftProfileService } from "@/features/minecraft/profiles/profiles.service.js";
import type { MinecraftServerService } from "@/features/minecraft/server/server.service.js";
import {
  defineOutboxMessage,
  type OutboxHandler,
  type OutboxPayloadOf,
} from "@/infrastructure/outbox/index.js";
import {
  minecraftProfileIdSchema,
  minecraftUsernameSchema,
} from "@minecraft-control-plane/shared/minecraft";
import { z } from "zod";

export const whitelistAddMessage = defineOutboxMessage({
  type: "minecraft.whitelistAdd",
  payloadSchema: z.strictObject({
    minecraftProfileId: minecraftProfileIdSchema,
    username: minecraftUsernameSchema,
  }),
});

export const whitelistRemoveMessage = defineOutboxMessage({
  type: "minecraft.whitelistRemove",
  payloadSchema: z.strictObject({
    minecraftProfileId: minecraftProfileIdSchema,
    username: minecraftUsernameSchema,
  }),
});

// Aggregated into `outboxMessageDefinitions` (outbox.registry.ts) the way
// schemas/constraints are; computed keys keep the type string written once.
export const minecraftProfileOutboxMessages = {
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
    const profile = await this.minecraftProfileService.findById(payload.minecraftProfileId);

    // Deleted since this was enqueued.
    if (profile === null) {
      return;
    }

    // Whitelist what the row says now, not what the payload snapshotted.
    // A throw here leaves the profile `pending` and the dispatcher retries.
    await this.minecraftServerService.addToWhitelist(profile.username);

    await this.minecraftProfileService.markWhitelisted(profile.id);
  }

  // The retries are exhausted: nothing else will whitelist this account, so
  // the profile stops being pending. No-ops if the profile is already gone.
  public async onDeadLetter(payload: OutboxPayloadOf<typeof whitelistAddMessage>): Promise<void> {
    await this.minecraftProfileService.markWhitelistFailed(payload.minecraftProfileId);
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
    // username re-added as a new profile) means the whitelist entry must stay.
    const currentOwner = await this.minecraftProfileService.findByUsername(payload.username);

    if (currentOwner !== null) {
      return;
    }

    await this.minecraftServerService.removeFromWhitelist(payload.username);
  }
}
