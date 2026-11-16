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
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Dashboard</h2>
        <nav aria-label="Dashboard sections" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            ["console", "Console"],
            ["whitelist", "Whitelist"],
            ["backups", "Backups"],
            ["users", "Users"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="text-muted hover:text-highlight focus-visible:outline-highlight underline underline-offset-4"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      <ServerPanel maintenance={maintenance} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div id="console" className="min-w-0 scroll-mt-5">
          <ConsolePanel maintenance={maintenance} />
        </div>
        <div id="whitelist" className="min-w-0 scroll-mt-5">
          <ProfilesPanel />
        </div>
        <div id="backups" className="min-w-0 scroll-mt-5">
          <BackupsPanel onMaintenance={setMaintenance} />
        </div>
        <div id="users" className="min-w-0 scroll-mt-5">
          <UsersPanel />
        </div>
      </div>
    </div>
  );
}
