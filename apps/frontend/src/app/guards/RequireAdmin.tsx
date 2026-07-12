// apps/frontend/src/app/guards/RequireAdmin.tsx

import { useAuth } from "@/app/providers/auth-context";
import { Navigate, Outlet } from "react-router";

/** Must be nested inside RequireAuth: assumes the user is already loaded. */
export function RequireAdmin() {
  const { user } = useAuth();

  if (user === null || !user.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
