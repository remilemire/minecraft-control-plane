// packages/shared/src/features/users/users.schemas.ts

import { emailSchema } from "@/common/index.js";
import { z } from "zod";

export const userIdSchema = z.uuid();

// 129 matches the DB check constraint (two former 64-char name columns joined
// with a space).
export const nameSchema = z.string().min(1).max(129);

export const createUserSchema = z
  .object({
    email: emailSchema,
    fullName: nameSchema.exactOptional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  fullName: nameSchema.nullable(),
  createdAt: z.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
