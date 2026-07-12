// apps/frontend/src/features/auth/googleIdentity.ts

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export interface GoogleCredentialResponse {
  credential: string;
}

export interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; shape?: string; width?: number },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let loader: Promise<GoogleAccountsId> | null = null;

/** Injects the Google Identity Services script once and resolves its API. */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  loader ??= new Promise((resolve, reject) => {
    if (window.google !== undefined) {
      resolve(window.google.accounts.id);
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.google !== undefined) {
        resolve(window.google.accounts.id);
      } else {
        reject(new Error("Google Identity Services failed to initialize."));
      }
    };
    script.onerror = () => {
      loader = null;
      reject(new Error("Failed to load Google Identity Services."));
    };
    document.head.appendChild(script);
  });

  return loader;
}
