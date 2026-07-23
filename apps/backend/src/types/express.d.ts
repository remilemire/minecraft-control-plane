// apps/backend/src/types/express.d.ts

import type { Session, User } from "@/infrastructure/db/schema/index.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session;
    }
  }
}
