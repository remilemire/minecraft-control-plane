// apps/backend/src/lib/crypto.ts
import { createHash, randomBytes } from "crypto";
export function generateRandomSecret() {
  const secret = randomBytes(32).toString("base64url");
  return secret;
}
export function hashSecret(secret) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
//# sourceMappingURL=crypto.js.map
