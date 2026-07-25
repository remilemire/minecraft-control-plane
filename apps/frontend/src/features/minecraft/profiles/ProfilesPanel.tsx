// apps/frontend/src/features/minecraft/profiles/ProfilesPanel.tsx

import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { McBadge } from "@/components/McBadge";
import { McButton } from "@/components/McButton";
import { McConfirmButton } from "@/components/McConfirmButton";
import { McInput } from "@/components/McInput";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { useRequest } from "@/lib/useRequest";
import { minecraftUsernameSchema } from "@minecraft-server/shared/minecraft";
import { useState, type FormEvent } from "react";
import { createProfile, deleteProfile, fetchProfiles } from "./api";

const USERNAME_HINT = "Usernames are 3-16 characters: letters, numbers, and underscores.";

interface AddProfileFormProps {
  onAdded: () => void;
}

function AddProfileForm({ onAdded }: AddProfileFormProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<ApiError | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsed = minecraftUsernameSchema.safeParse(username);
    if (!parsed.success) {
      setError(USERNAME_HINT);
      return;
    }

    setSaving(true);
    setError(null);
    setAdded(false);
    try {
      await createProfile(parsed.data);
      setUsername("");
      setAdded(true);
      onAdded();
    } catch (submitError) {
      setError(toApiError(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
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
            setAdded(false);
          }}
          placeholder="Steve"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1"
        />
        <McButton type="submit" disabled={saving || username === ""}>
          {saving ? "Adding..." : "Whitelist"}
        </McButton>
      </div>
      <ErrorText error={error} className="mt-2 text-sm" />
      {added && (
        <p role="status" className="text-success mt-2 text-sm">
          Whitelisted! They can now join the server.
        </p>
      )}
    </form>
  );
}

export function ProfilesPanel() {
  const { data: profiles, error, loading, reload } = useRequest(fetchProfiles);
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  async function handleRemove(minecraftProfileId: string) {
    setRemoving(minecraftProfileId);
    setActionError(null);
    try {
      await deleteProfile(minecraftProfileId);
      reload();
    } catch (removeError) {
      setActionError(toApiError(removeError));
    } finally {
      setRemoving(null);
    }
  }

  // The form stays mounted through reloads so its feedback isn't lost when
  // the freshly whitelisted profile is refetched.
  return (
    <McPanel title="Whitelist">
      <AddProfileForm onAdded={reload} />

      <div className="mt-4">
        {loading && <LoadingText />}

        {profiles !== null && profiles.length === 0 && (
          <p className="text-muted">No profiles whitelisted yet. {USERNAME_HINT}</p>
        )}

        {profiles !== null && profiles.length > 0 && (
          <ul className="divide-slot divide-y">
            {profiles.map((profile) => (
              <li key={profile.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-bold">{profile.username}</p>
                  <p className="text-muted truncate text-xs" title={profile.uuid}>
                    {profile.uuid}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <McBadge variant={profile.online ? "success" : "muted"}>
                    {profile.online ? "Online" : "Offline"}
                  </McBadge>
                  <McConfirmButton
                    onConfirm={() => void handleRemove(profile.id)}
                    disabled={removing !== null}
                    className="px-2 py-1 text-sm"
                  >
                    {removing === profile.id ? "Removing..." : "Remove"}
                  </McConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ErrorText error={error ?? actionError} className="mt-4" />
    </McPanel>
  );
}
