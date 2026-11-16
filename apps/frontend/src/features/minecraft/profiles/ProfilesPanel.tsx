// apps/frontend/src/features/minecraft/profiles/ProfilesPanel.tsx

import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { McBadge } from "@/components/McBadge";
import { McButton } from "@/components/McButton";
import { McConfirmButton } from "@/components/McConfirmButton";
import { McInput } from "@/components/McInput";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { usePoll } from "@/lib/usePoll";
import { useRequest } from "@/lib/useRequest";
import {
  minecraftUsernameSchema,
  type WhitelistStatus,
} from "@minecraft-control-plane/shared/minecraft";
import { useState, type FormEvent } from "react";
import { createProfile, deleteProfile, fetchProfiles, type MinecraftProfile } from "./api";

const USERNAME_HINT = "Usernames are 3-16 characters: letters, numbers, and underscores.";

// A pending profile is waiting on the server's whitelist command, which the
// backend applies asynchronously — refetch quickly until every profile has
// settled.
const PENDING_POLL_MS = 3_000;

// `online` is live RCON state, not a settling one: players join and leave for
// as long as the panel is open, so the slow poll never stops. Kept in step
// with the server panel's status cadence — the two badges describe the same
// server, and drifting them apart makes the dashboard disagree with itself.
const ONLINE_POLL_MS = 15_000;

const WHITELIST_STATUS_BADGES = {
  pending: { label: "Pending", variant: "highlight" },
  whitelisted: { label: "Whitelisted", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
} as const satisfies Record<
  WhitelistStatus,
  { label: string; variant: "success" | "danger" | "highlight" }
>;

function isPending(profile: MinecraftProfile): boolean {
  return profile.whitelistStatus === "pending";
}

// The one place a whitelist status becomes label + colour.
function WhitelistBadge({ status }: { status: WhitelistStatus }) {
  const { label, variant } = WHITELIST_STATUS_BADGES[status];

  return <McBadge variant={variant}>{label}</McBadge>;
}

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
      {/* The POST only enqueues the whitelist command — the profile lands
          `pending` and the outbox settles it, so promising they can join now
          would be a lie for as long as the server is unreachable. */}
      {added && (
        <p role="status" className="text-success mt-2 text-sm">
          Added! Whitelisting them now — the status below will update.
        </p>
      )}
    </form>
  );
}

export function ProfilesPanel() {
  const { data: profiles, error, loading, reload } = useRequest(fetchProfiles);
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const hasPending = profiles?.some(isPending) ?? false;

  // Fast while a whitelist command is still settling, slow forever after to
  // keep the online badges honest.
  usePoll(reload, hasPending ? PENDING_POLL_MS : ONLINE_POLL_MS);

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

  // A poll is not something the user is waiting on, so only the first load
  // stands the Refresh button down.
  const initialLoad = loading && profiles === null;

  // The form stays mounted through reloads so its feedback isn't lost when
  // the freshly whitelisted profile is refetched.
  return (
    <McPanel
      title="Whitelist"
      actions={
        <McButton
          onClick={reload}
          disabled={initialLoad || removing !== null}
          className="px-2 py-1 text-sm"
        >
          Refresh
        </McButton>
      }
    >
      {profiles !== null && (
        <p className="text-muted mb-4 text-sm">
          <span className="text-success">
            {profiles.filter((profile) => profile.online).length} online
          </span>
          {" · "}
          {profiles.length} {profiles.length === 1 ? "profile" : "profiles"}
        </p>
      )}
      <AddProfileForm onAdded={reload} />

      <div className="mt-4">
        {/* Only the first load: a poll keeps the list on screen instead of
            replacing it with "Loading..." every few seconds. */}
        {initialLoad && <LoadingText />}

        {profiles !== null && profiles.length === 0 && (
          <p className="text-muted">No profiles whitelisted yet. {USERNAME_HINT}</p>
        )}

        {profiles !== null && profiles.length > 0 && (
          <ul className="divide-slot max-h-72 divide-y overflow-y-auto">
            {profiles.map((profile) => (
              <li key={profile.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-24">
                  <p className="truncate font-bold" title={profile.username}>
                    {profile.username}
                  </p>
                  <p className="text-muted truncate text-xs" title={profile.uuid}>
                    {profile.uuid}
                  </p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <WhitelistBadge status={profile.whitelistStatus} />
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
