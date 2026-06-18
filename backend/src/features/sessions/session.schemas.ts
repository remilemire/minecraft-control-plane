// backend/src/features/sessions/session.schemas.ts

import z, { uuid } from "zod";

export const createSessionSchema = z.object({
  userId: uuid(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
