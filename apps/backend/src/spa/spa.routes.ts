// apps/backend/src/spa/spa.routes.ts

import express, { Router } from "express";
import path from "node:path";

// Vite content-hashes everything under /assets, so those files are immutable;
// index.html (and any other top-level file) must revalidate on every load so
// a deploy is picked up immediately.
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const REVALIDATE_CACHE = "no-cache";

// Serves the built SPA same-origin: static files first, then the
// history-API fallback — any GET nothing else matched gets index.html (200)
// and the client router renders the page, including its own 404. Mounted
// after the /api routes (createApp), so API traffic never lands here.
export function createSpaRoutes(spaDir: string): Router {
  const router = Router();
  const root = path.resolve(spaDir);
  const assetsPrefix = path.join(root, "assets") + path.sep;

  router.use(
    express.static(root, {
      index: false,
      setHeaders: (res, filePath) => {
        res.setHeader(
          "Cache-Control",
          filePath.startsWith(assetsPrefix) ? IMMUTABLE_CACHE : REVALIDATE_CACHE,
        );
      },
    }),
  );

  // Express 5 dropped the bare "*" path; the braced splat also matches "/".
  router.get("/{*splat}", (_req, res, next) => {
    res.sendFile(
      path.join(root, "index.html"),
      { headers: { "Cache-Control": REVALIDATE_CACHE } },
      (error?: Error) => {
        if (error !== undefined) {
          next(error);
        }
      },
    );
  });

  return router;
}
