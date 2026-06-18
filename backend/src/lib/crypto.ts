// backend/src/lib/crypto.ts

import type { Brand } from "@/lib/types.js";

export type RandomSecret = Brand<string, "RandomSecret">;
export type SecretHash = Brand<string, "SecretHash">;

export function generateRandomSecret(): RandomSecret {
  // TODO
  return "" as RandomSecret;
}

export function hashSecret(secret: RandomSecret): SecretHash {
  // TODO
  void secret;
  return "" as SecretHash;
}
