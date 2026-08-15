// apps/frontend/src/features/users/UsersPanel.tsx

import { useAuth } from "@/app/providers/auth-context";
import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { McBadge } from "@/components/McBadge";
import { McButton } from "@/components/McButton";
import { McConfirmButton } from "@/components/McConfirmButton";
import { McInput } from "@/components/McInput";
import { McPanel } from "@/components/McPanel";
import { toApiError, type ApiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { useRequest } from "@/lib/useRequest";
import { createUserSchema } from "@minecraft-control-plane/shared/users";
import { useState, type FormEvent } from "react";
import { createUser, fetchUsers, transferOwnership } from "./api";

export function UsersPanel() {
  const { user: me } = useAuth();
  const { data: users, error, loading, reload } = useRequest(fetchUsers);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | string | null>(null);

  const isOwner = me?.isOwner ?? false;

  async function handleAdd(event: FormEvent) {
    event.preventDefault();

    const parsed = createUserSchema.safeParse({ email });
    if (!parsed.success) {
      setActionError("Enter a valid email address.");
      return;
    }

    setAdding(true);
    setActionError(null);
    try {
      await createUser(parsed.data.email);
      setEmail("");
      reload();
    } catch (addError) {
      setActionError(toApiError(addError));
    } finally {
      setAdding(false);
    }
  }

  async function handleTransfer(userId: string) {
    setTransferring(userId);
    setActionError(null);
    try {
      await transferOwnership(userId);
      reload();
    } catch (transferError) {
      setActionError(toApiError(transferError));
    } finally {
      setTransferring(null);
    }
  }

  return (
    <McPanel title="Users">
      {isOwner && (
        // noValidate: the shared zod schema owns validation, not the browser.
        <form onSubmit={(event) => void handleAdd(event)} noValidate className="mb-4 flex gap-2">
          <label htmlFor="user-email" className="sr-only">
            Email address
          </label>
          <McInput
            id="user-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="player@example.com"
            className="min-w-0 flex-1"
          />
          <McButton type="submit" disabled={adding || email === ""}>
            {adding ? "Adding..." : "Add"}
          </McButton>
        </form>
      )}

      {loading && <LoadingText />}

      {users !== null && users.length === 0 && <p className="text-muted">No users yet.</p>}

      {users !== null && users.length > 0 && (
        <ul className="divide-slot divide-y">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-bold">{user.fullName ?? user.email}</p>
                <p className="text-muted truncate text-xs">
                  {user.email} · joined {formatDate(user.createdAt)}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {user.isOwner && <McBadge variant="highlight">Owner</McBadge>}
                {isOwner && user.id !== me?.id && (
                  <McConfirmButton
                    onConfirm={() => void handleTransfer(user.id)}
                    disabled={transferring !== null}
                    className="px-2 py-1 text-sm"
                  >
                    {transferring === user.id ? "Transferring..." : "Make owner"}
                  </McConfirmButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ErrorText error={error ?? actionError} className="mt-4" />
    </McPanel>
  );
}
