// packages/shared/src/schemas/users.schemas.ts

import z from "zod";
import { emailSchema } from "./common.schemas.js";

const nameSchema = z.string().min(1).max(64);

export const createUserSchema = z.object({
  email: emailSchema,
  googleId: z.string(),
  firstName: nameSchema.exactOptional(),
  lastName: nameSchema.exactOptional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  firstName: nameSchema.exactOptional(),
  lastName: nameSchema.exactOptional(),
  isAdmin: z.boolean(),
  createdAt: z.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
