// apps/frontend/src/features/auth/api.ts

import { userSchema, type User } from "@/features/users/api";
import { apiRequest } from "@/lib/apiClient";
import { oauthLoginSchema } from "@minecraft-server/shared/auth";

export function loginWithGoogle(credential: string): Promise<User> {
  return apiRequest("POST", "/auth/google", {
    schema: userSchema,
    body: oauthLoginSchema.parse({ credential }),
  });
}

export function logout(): Promise<undefined> {
  return apiRequest("POST", "/auth/logout");
}
