// packages/shared/src/features/auth/auth.schemas.ts

import z from "zod";

export const googleLoginSchema = z
  .object({
    credential: z.string().min(1),
  })
  .strict();

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
