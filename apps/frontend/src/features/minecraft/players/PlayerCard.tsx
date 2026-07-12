// apps/frontend/src/features/minecraft/players/PlayerCard.tsx

import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { McBadge } from "@/components/McBadge";
import { McButton } from "@/components/McButton";
import { McInput } from "@/components/McInput";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { useRequest } from "@/lib/useRequest";
import { minecraftUsernameSchema } from "@minecraft-server/shared/minecraft";
import { useState, type FormEvent } from "react";
import { fetchMyPlayer, setMyPlayer, type MinecraftPlayer } from "./api";

const USERNAME_HINT = "Usernames are 3-16 characters: letters, numbers, and underscores.";

interface UsernameFormProps {
  submitLabel: string;
  onSaved: () => void;
}

function UsernameForm({ submitLabel, onSaved }: UsernameFormProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<ApiError | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsed = minecraftUsernameSchema.safeParse(username);
    if (!parsed.success) {
      setError(USERNAME_HINT);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setMyPlayer(parsed.data);
      setUsername("");
      setSaved(true);
      onSaved();
    } catch (submitError) {
      setError(toApiError(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-4">
      <label htmlFor="minecraft-username" className="text-muted mb-2 block text-sm">
        Minecraft username
      </label>
      <div className="flex gap-2">
        <McInput
          id="minecraft-username"
          name="username"
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setSaved(false);
          }}
          placeholder="Steve"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
        />
        <McButton type="submit" disabled={saving || username === ""}>
          {saving ? "Saving..." : submitLabel}
        </McButton>
      </div>
      <ErrorText error={error} className="mt-2 text-sm" />
      {saved && (
        <p role="status" className="text-success mt-2 text-sm">
          Whitelisted! You can now join the server.
        </p>
      )}
    </form>
  );
}

function LinkedPlayer({ player }: { player: MinecraftPlayer }) {
  return (
    <div className="bg-slot mc-inset flex items-center gap-4 p-4">
      <div>
        <p className="text-lg font-bold">{player.username}</p>
        <p className="text-muted text-xs" title={player.uuid}>
          {player.uuid}
        </p>
      </div>
      <div className="ml-auto">
        <McBadge variant={player.online ? "success" : "muted"}>
          {player.online ? "Online" : "Offline"}
        </McBadge>
      </div>
    </div>
  );
}

export function PlayerCard() {
  const { data: player, error, loading, reload } = useRequest(fetchMyPlayer);

  const notLinked = error !== null && error.code === "MINECRAFT_PROFILE_NOT_FOUND";

  if (error !== null && !notLinked) {
    return (
      <McPanel title="My Player">
        <ErrorText error={error} />
        <McButton onClick={reload} className="mt-4">
          Try again
        </McButton>
      </McPanel>
    );
  }

  // The form stays mounted through reloads so its feedback isn't lost when
  // the freshly linked player is refetched.
  return (
    <McPanel title="My Player">
      {loading ? (
        <LoadingText />
      ) : player !== null ? (
        <LinkedPlayer player={player} />
      ) : (
        <p className="text-muted">
          Link your Minecraft account to get whitelisted on the server. {USERNAME_HINT}
        </p>
      )}
      <UsernameForm submitLabel={player !== null ? "Update" : "Link account"} onSaved={reload} />
      {player !== null && (
        <p className="text-muted mt-4 text-xs">
          Linking a different account replaces this one. Only an admin can unlink you.
        </p>
      )}
    </McPanel>
  );
}
