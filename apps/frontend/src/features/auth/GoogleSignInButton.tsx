// apps/frontend/src/features/auth/GoogleSignInButton.tsx

import { ErrorText } from "@/components/ErrorText";
import { useEffect, useRef, useState } from "react";
import { loadGoogleIdentity } from "./googleIdentity";

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
}

export function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (clientId === undefined || clientId === "") return;

    let cancelled = false;

    loadGoogleIdentity().then(
      (googleId) => {
        const container = containerRef.current;
        if (cancelled || container === null) return;

        googleId.initialize({
          client_id: clientId,
          callback: (response) => onCredential(response.credential),
        });
        // StrictMode re-runs effects: clear any previously rendered button.
        container.replaceChildren();
        googleId.renderButton(container, { theme: "filled_black", size: "large" });
      },
      (error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load Google sign-in.");
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential]);

  if (clientId === undefined || clientId === "") {
    return <ErrorText error="Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID)." />;
  }

  return (
    <div>
      <div ref={containerRef} data-testid="google-signin" />
      <ErrorText error={loadError} />
    </div>
  );
}
