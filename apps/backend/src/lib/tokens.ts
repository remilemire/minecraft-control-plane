// apps/backend/src/lib/tokens.ts

import { createHash, randomBytes } from "crypto";

export function generateRandomSecret(): string {
  const secret = randomBytes(32).toString("base64url");
  return secret;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
