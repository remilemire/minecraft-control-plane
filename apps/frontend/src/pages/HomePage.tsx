// apps/frontend/src/pages/HomePage.tsx

import { ConsolePanel } from "@/features/minecraft/server/console/ConsolePanel";
import { ProfilesPanel } from "@/features/minecraft/profiles/ProfilesPanel";
import { ServerPanel } from "@/features/minecraft/server/ServerPanel";
import { UsersPanel } from "@/features/users/UsersPanel";

export function HomePage() {
  return (
    <div className="grid gap-6">
      <ConsolePanel />
      <ProfilesPanel />
      <div className="grid gap-6 lg:grid-cols-2">
        <ServerPanel />
        <UsersPanel />
      </div>
    </div>
  );
}
