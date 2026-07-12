// apps/frontend/src/components/AppLayout.tsx

import { useAuth } from "@/app/providers/auth-context";
import { McButton } from "@/components/McButton";
import { NavLink, Outlet } from "react-router";

function navLinkClasses({ isActive }: { isActive: boolean }) {
  return `px-3 py-1 hover:text-highlight ${isActive ? "mc-inset bg-slot" : ""}`;
}

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="bg-panel mc-raised flex flex-wrap items-center gap-4 px-6 py-4">
        <h1 className="text-xl font-bold">Minecraft Server</h1>

        <nav className="flex gap-2">
          <NavLink to="/" end className={navLinkClasses}>
            My Player
          </NavLink>
          {user?.isAdmin === true && (
            <NavLink to="/admin" className={navLinkClasses}>
              Dashboard
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-muted">{user?.email}</span>
          <McButton onClick={() => void logout()}>Log out</McButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
