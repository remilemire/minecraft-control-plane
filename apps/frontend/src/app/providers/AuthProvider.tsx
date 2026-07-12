// apps/frontend/src/app/providers/AuthProvider.tsx

import { loginWithGoogle, logout as logoutRequest } from "@/features/auth/api";
import { fetchMe, type User } from "@/features/users/api";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type AuthStatus } from "./auth-context";

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  useEffect(() => {
    let cancelled = false;

    fetchMe().then(
      (user) => {
        if (!cancelled) setState({ status: "authenticated", user });
      },
      () => {
        if (!cancelled) setState({ status: "unauthenticated", user: null });
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credential: string) => {
    const user = await loginWithGoogle(credential);
    setState({ status: "authenticated", user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Even if the request fails the local session is gone as far as the
      // UI is concerned; the next login will mint fresh cookies.
    }
    setState({ status: "unauthenticated", user: null });
  }, []);

  const value = useMemo(
    () => ({ status: state.status, user: state.user, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
