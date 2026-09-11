// apps/frontend/src/pages/HomePage.tsx

import { ConsolePanel } from "@/features/minecraft/server/console/ConsolePanel";
import { ProfilesPanel } from "@/features/minecraft/profiles/ProfilesPanel";
import { ServerPanel } from "@/features/minecraft/server/ServerPanel";
import { UsersPanel } from "@/features/users/UsersPanel";
import { BackupsPanel } from "@/features/minecraft/backups/BackupsPanel";
import { useState } from "react";
import type { MaintenanceOperation } from "@minecraft-control-plane/shared/minecraft";

export function HomePage() {
  const [maintenance, setMaintenance] = useState<MaintenanceOperation | null>(null);
  return (
    <div className="grid gap-6">
      <ConsolePanel maintenance={maintenance} />
      <BackupsPanel onMaintenance={setMaintenance} />
      <ProfilesPanel />
      <div className="grid gap-6 lg:grid-cols-2">
        <ServerPanel maintenance={maintenance} />
        <UsersPanel />
      </div>
    </div>
  );
}
