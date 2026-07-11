// apps/backend/src/features/sessions/session.schemas.ts
import z, { uuid } from "zod";
export const createSessionSchema = z.object({
  userId: uuid(),
});
//# sourceMappingURL=session.schemas.js.map
