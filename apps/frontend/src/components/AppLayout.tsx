// apps/frontend/src/components/AppLayout.tsx

import { useAuth } from "@/app/providers/auth-context";
import { McButton } from "@/components/McButton";
import { Outlet } from "react-router";

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="bg-panel mc-raised flex flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold">Minecraft Control Plane</h1>

        <div className="ml-auto flex min-w-0 items-center gap-4">
          <span className="text-muted truncate text-sm" title={user?.email}>
            {user?.email}
          </span>
          <McButton className="shrink-0" onClick={() => void logout()}>
            Log out
          </McButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[96rem] px-4 py-5 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
