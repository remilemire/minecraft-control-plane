// apps/backend/test/fakes/fake-mojang.client.ts

import type { MojangApi, MojangProfile } from "@/features/minecraft/minecraft.types.js";

// In-memory stand-in for the Mojang HTTP API. Register accounts with
// setProfile(); lookups for anything else resolve to null, like a 404.
export class FakeMojangClient implements MojangApi {
  private readonly profiles = new Map<string, MojangProfile>();

  public setProfile(profile: MojangProfile): void {
    this.profiles.set(profile.username.toLowerCase(), profile);
  }

  public async findByUsername(username: string): Promise<MojangProfile | null> {
    return this.profiles.get(username.toLowerCase()) ?? null;
  }
}
