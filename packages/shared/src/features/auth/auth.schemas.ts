// packages/shared/src/features/auth/auth.schemas.ts

import z from "zod";

export const oauthLoginSchema = z
  .object({
    credential: z.string().min(1),
  })
  .strict();

export type OAuthLoginInput = z.infer<typeof oauthLoginSchema>;
