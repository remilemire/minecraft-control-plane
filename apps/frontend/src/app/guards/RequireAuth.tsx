// apps/frontend/src/app/guards/RequireAuth.tsx

import { useAuth } from "@/app/providers/auth-context";
import { LoadingText } from "@/components/LoadingText";
import { Navigate, Outlet } from "react-router";

export function RequireAuth() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingText />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
