// apps/frontend/vite.config.ts

import tailwindcss from "@tailwindcss/vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Reachable from outside the container in the Compose dev stack.
    host: true,
    // Same-origin /api in dev; compose.yaml overrides BACKEND_ORIGIN to the
    // in-network backend address (http://backend:8000).
    proxy: {
      "/api": {
        target: process.env.BACKEND_ORIGIN ?? "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, "./dist"),
    emptyOutDir: true,
  },
});
