// apps/frontend/src/features/users/api.ts

import { apiRequest } from "@/lib/apiClient";
import { userResponseSchema } from "@minecraft-server/shared/users";
import { z } from "zod";

// The shared response schemas type timestamps as Date (the backend serializes
// them); on the wire they are ISO strings, so coerce them back.
export const userSchema = userResponseSchema.extend({
  createdAt: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

export function fetchMe(): Promise<User> {
  return apiRequest("GET", "/users/me", { schema: userSchema });
}

export function fetchUsers(): Promise<User[]> {
  return apiRequest("GET", "/users", { schema: z.array(userSchema) });
}
