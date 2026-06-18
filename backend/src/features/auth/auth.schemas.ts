// backend/src/features/auth/auth.schemas.ts

import { createUserProfileSchema } from "@/features/users/user.schemas.js";
import { emailSchema } from "@/shared/schemas.js";
import z from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const registerSchema = createUserProfileSchema.extend({
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
