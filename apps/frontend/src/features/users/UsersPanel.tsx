// apps/frontend/src/features/users/UsersPanel.tsx

import { ErrorText } from "@/components/ErrorText";
import { LoadingText } from "@/components/LoadingText";
import { McBadge } from "@/components/McBadge";
import { McPanel } from "@/components/McPanel";
import { formatDate } from "@/lib/format";
import { useRequest } from "@/lib/useRequest";
import { fetchUsers, type User } from "./api";

function displayName(user: User): string | null {
  const name = [user.firstName, user.lastName].filter((part) => part !== null).join(" ");
  return name === "" ? null : name;
}

export function UsersPanel() {
  const { data: users, error, loading } = useRequest(fetchUsers);

  return (
    <McPanel title="Users">
      {loading && <LoadingText />}

      {users !== null && users.length === 0 && <p className="text-muted">No users yet.</p>}

      {users !== null && users.length > 0 && (
        <ul className="divide-slot divide-y">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-bold">{displayName(user) ?? user.email}</p>
                <p className="text-muted truncate text-xs">
                  {user.email} · joined {formatDate(user.createdAt)}
                </p>
              </div>
              {user.isAdmin && (
                <div className="ml-auto">
                  <McBadge variant="highlight">Admin</McBadge>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ErrorText error={error} className="mt-4" />
    </McPanel>
  );
}
