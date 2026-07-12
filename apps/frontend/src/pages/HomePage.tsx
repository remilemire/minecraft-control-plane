// apps/frontend/src/pages/HomePage.tsx

import { PlayerCard } from "@/features/minecraft/players/PlayerCard";

export function HomePage() {
  return (
    <div className="mx-auto max-w-lg">
      <PlayerCard />
    </div>
  );
}
