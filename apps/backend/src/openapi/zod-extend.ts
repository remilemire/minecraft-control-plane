// apps/backend/src/openapi/zod-extend.ts

// Adds .openapi() to zod. Zod v4 copies base methods onto each schema
// instance at construction time, so this must run before ANY schema is
// created — including the ones in @minecraft-server/shared. Import this
// module first in every entry point (see app.ts and test/setup/setup-env.ts).

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);
