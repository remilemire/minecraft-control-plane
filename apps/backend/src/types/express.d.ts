// apps/backend/src/types/express.d.ts

import type { Session, User } from "@/db/schema/index.ts";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
    }
  }
}
