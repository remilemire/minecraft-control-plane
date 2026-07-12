// apps/frontend/src/vite-env.d.ts

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client id used to render the Google sign-in button. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
