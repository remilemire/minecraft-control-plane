// apps/frontend/src/features/minecraft/players/PlayersPanel.tsx

import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { McBadge } from "@/components/McBadge";
import { McConfirmButton } from "@/components/McConfirmButton";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { useRequest } from "@/lib/useRequest";
import { useState } from "react";
import { fetchPlayers, unlinkPlayer } from "./api";

export function PlayersPanel() {
  const { data: players, error, loading, reload } = useRequest(fetchPlayers);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  async function handleUnlink(userId: string) {
    setUnlinking(userId);
    setActionError(null);
    try {
      await unlinkPlayer(userId);
      reload();
    } catch (unlinkError) {
      setActionError(toApiError(unlinkError));
    } finally {
      setUnlinking(null);
    }
  }

  return (
    <McPanel title="Players">
      {loading && <LoadingText />}

      {players !== null && players.length === 0 && (
        <p className="text-muted">No players linked yet.</p>
      )}

      {players !== null && players.length > 0 && (
        <ul className="divide-slot divide-y">
          {players.map((player) => (
            <li key={player.userId} className="flex items-center gap-3 py-2">
              <div className="min-w-0">
                <p className="font-bold">{player.username}</p>
                <p className="text-muted truncate text-xs" title={player.uuid}>
                  {player.uuid}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <McBadge variant={player.online ? "success" : "muted"}>
                  {player.online ? "Online" : "Offline"}
                </McBadge>
                <McConfirmButton
                  onConfirm={() => void handleUnlink(player.userId)}
                  disabled={unlinking !== null}
                  className="px-2 py-1 text-sm"
                >
                  {unlinking === player.userId ? "Unlinking..." : "Unlink"}
                </McConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ErrorText error={error ?? actionError} className="mt-4" />
    </McPanel>
  );
}
