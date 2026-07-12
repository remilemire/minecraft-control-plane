// apps/frontend/src/features/invitations/InvitationsPanel.tsx

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
import { createInvitationSchema } from "@minecraft-server/shared/invitations";
import { useState, type FormEvent } from "react";
import { createInvitation, deleteInvitation, fetchInvitations, type Invitation } from "./api";

function invitationStatus(invitation: Invitation): {
  label: string;
  variant: "success" | "danger" | "highlight";
} {
  if (invitation.acceptedAt !== null) return { label: "Accepted", variant: "success" };
  if (invitation.expiresAt.getTime() < Date.now()) return { label: "Expired", variant: "danger" };
  return { label: "Pending", variant: "highlight" };
}

export function InvitationsPanel() {
  const { data: invitations, error, loading, reload } = useRequest(fetchInvitations);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ApiError | string | null>(null);

  async function handleInvite(event: FormEvent) {
    event.preventDefault();

    const parsed = createInvitationSchema.safeParse({ email });
    if (!parsed.success) {
      setActionError("Enter a valid email address.");
      return;
    }

    setInviting(true);
    setActionError(null);
    try {
      await createInvitation(parsed.data.email);
      setEmail("");
      reload();
    } catch (inviteError) {
      setActionError(toApiError(inviteError));
    } finally {
      setInviting(false);
    }
  }

  async function handleDelete(invitationId: string) {
    setDeleting(invitationId);
    setActionError(null);
    try {
      await deleteInvitation(invitationId);
      reload();
    } catch (deleteError) {
      setActionError(toApiError(deleteError));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <McPanel title="Invitations">
      {/* noValidate: the shared zod schema owns validation, not the browser. */}
      <form onSubmit={(event) => void handleInvite(event)} noValidate className="mb-4 flex gap-2">
        <label htmlFor="invitation-email" className="sr-only">
          Email address
        </label>
        <McInput
          id="invitation-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="player@example.com"
          className="min-w-0 flex-1"
        />
        <McButton type="submit" disabled={inviting || email === ""}>
          {inviting ? "Inviting..." : "Invite"}
        </McButton>
      </form>

      {loading && <LoadingText />}

      {invitations !== null && invitations.length === 0 && (
        <p className="text-muted">No invitations yet.</p>
      )}

      {invitations !== null && invitations.length > 0 && (
        <ul className="divide-slot divide-y">
          {invitations.map((invitation) => {
            const status = invitationStatus(invitation);
            return (
              <li key={invitation.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{invitation.email}</p>
                  <p className="text-muted text-xs">Expires {formatDate(invitation.expiresAt)}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <McBadge variant={status.variant}>{status.label}</McBadge>
                  <McConfirmButton
                    onConfirm={() => void handleDelete(invitation.id)}
                    disabled={deleting !== null}
                    className="px-2 py-1 text-sm"
                  >
                    {deleting === invitation.id ? "Deleting..." : "Delete"}
                  </McConfirmButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ErrorText error={error ?? actionError} className="mt-4" />
    </McPanel>
  );
}
