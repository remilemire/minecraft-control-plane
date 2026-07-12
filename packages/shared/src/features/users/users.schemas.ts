// packages/shared/src/features/users/users.schemas.ts

import { emailSchema } from "@/common/index.js";
import z from "zod";

export const userIdSchema = z.uuid();

export const nameSchema = z.string().min(1).max(64);

export const createUserSchema = z
  .object({
    email: emailSchema,
    googleId: z.string(),
    firstName: nameSchema.exactOptional(),
    lastName: nameSchema.exactOptional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  firstName: nameSchema.nullable(),
  lastName: nameSchema.nullable(),
  isAdmin: z.boolean(),
  createdAt: z.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
