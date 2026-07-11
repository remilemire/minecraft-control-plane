// apps/backend/src/features/auth/auth.passwords.ts
import argon2 from "argon2";
export async function hashPassword(password) {
  return await argon2.hash(password);
}
export async function verifyPassword(password, passwordHash) {
  return argon2.verify(passwordHash, password);
}
//# sourceMappingURL=auth.passwords.js.map
