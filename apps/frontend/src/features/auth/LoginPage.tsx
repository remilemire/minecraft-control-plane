// apps/frontend/src/features/auth/LoginPage.tsx

import { useAuth } from "@/app/providers/auth-context";
import { ErrorText } from "@/components/ErrorText";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { useCallback, useState } from "react";
import { GoogleSignInButton } from "./GoogleSignInButton";

export function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<ApiError | null>(null);

  const handleCredential = useCallback(
    (credential: string) => {
      setError(null);
      // A successful login flips the auth state and RequireGuest redirects.
      login(credential).catch((loginError: unknown) => setError(toApiError(loginError)));
    },
    [login],
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <McPanel className="w-full max-w-md text-center">
        <h1 className="mb-2 text-2xl font-bold">Minecraft Control Plane</h1>
        <p className="text-muted mb-6">Sign in with Google. Ask the server owner for access.</p>

        <div className="flex justify-center">
          <GoogleSignInButton onCredential={handleCredential} />
        </div>

        <ErrorText error={error} className="mt-4" />
      </McPanel>
    </div>
  );
}
