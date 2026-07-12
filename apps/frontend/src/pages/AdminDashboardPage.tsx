// apps/frontend/src/pages/AdminDashboardPage.tsx

import { InvitationsPanel } from "@/features/invitations/InvitationsPanel";
import { PlayersPanel } from "@/features/minecraft/players/PlayersPanel";
import { ServerPanel } from "@/features/minecraft/server/ServerPanel";
import { UsersPanel } from "@/features/users/UsersPanel";

export function AdminDashboardPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ServerPanel />
      <PlayersPanel />
      <InvitationsPanel />
      <UsersPanel />
    </div>
  );
}
