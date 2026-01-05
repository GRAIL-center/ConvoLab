import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTRPC } from '../../api/trpc';
import { RoleBadge } from '../../components/RoleBadge';

type Role = 'GUEST' | 'USER' | 'STAFF' | 'ADMIN';

function formatDate(date: Date | string | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return 'just now';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [showRoleConfirm, setShowRoleConfirm] = useState(false);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    ...trpc.user.get.queryOptions({ id: id ?? '' }),
    enabled: !!id,
  });

  const { data: me } = useQuery(trpc.auth.me.queryOptions());

  const cancelModal = useCallback(() => {
    setShowRoleConfirm(false);
    setPendingRole(null);
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showRoleConfirm) {
        cancelModal();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showRoleConfirm, cancelModal]);

  const updateRoleMutation = useMutation({
    ...trpc.user.updateRole.mutationOptions(),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: trpc.user.get.queryKey({ id }) });
      }
      // Invalidate all user list queries regardless of parameters
      queryClient.invalidateQueries({ queryKey: ['user', 'list'] });
      setShowRoleConfirm(false);
      setPendingRole(null);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
      setShowRoleConfirm(false);
      setPendingRole(null);
    },
  });

  const handleRoleChange = (newRole: Role) => {
    if (!user) return;
    if (newRole === user.role) return;
    setPendingRole(newRole);
    setShowRoleConfirm(true);
  };

  const confirmRoleChange = () => {
    if (!pendingRole || !id) return;
    updateRoleMutation.mutate({ id, role: pendingRole });
  };

  const isCurrentUser = me?.user?.id === id;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="py-12 text-center text-gray-500">Loading user...</div>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="p-6">
        <div className="py-12 text-center text-red-600">Failed to load user</div>
        <div className="text-center">
          <Link to="/admin/users" className="text-amber-600 hover:text-amber-800">
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/admin/users"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <title>Back</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Users
        </Link>
      </div>

      {/* Error message */}
      {error && <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {/* User profile card */}
      <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
        <div className="p-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-20 w-20 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-2xl text-gray-500">
                {user.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{user.name || 'Anonymous User'}</h1>

              {user.externalIdentities.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {user.externalIdentities.map((identity) => (
                    <div key={identity.id} className="text-sm text-gray-500">
                      {identity.email} ({identity.provider})
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm italic text-gray-400">No linked accounts</p>
              )}

              <div className="mt-3 flex items-center gap-4">
                <RoleBadge role={user.role as Role} size="md" />
                {isCurrentUser && <span className="text-xs text-gray-400">(This is you)</span>}
              </div>
            </div>

            {/* Stats */}
            <div className="text-right">
              <div className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{user.sessionCount}</span> sessions
              </div>
              <div className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{user.invitationsCreatedCount}</span>{' '}
                invitations created
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div className="mt-6 border-t border-gray-100 pt-4">
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="font-medium text-gray-900">{formatDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Last Login</dt>
                <dd className="font-medium text-gray-900">{formatDate(user.lastLoginAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">User ID</dt>
                <dd className="font-mono text-xs text-gray-500">{user.id}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Role management */}
      <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <h2 className="font-semibold text-gray-900">Role Management</h2>
        </div>
        <div className="p-6">
          <p className="mb-4 text-sm text-gray-600">
            GUEST and USER roles are determined automatically by identity status. STAFF and ADMIN
            roles can be assigned manually.
          </p>

          <div className="flex items-center gap-4">
            <label htmlFor="role-select" className="text-sm font-medium text-gray-700">
              Change role:
            </label>
            <select
              id="role-select"
              value={user.role}
              onChange={(e) => handleRoleChange(e.target.value as Role)}
              disabled={isCurrentUser || updateRoleMutation.isPending}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              <option value="GUEST" disabled={user.hasIdentity}>
                GUEST {user.hasIdentity ? '(has identity)' : ''}
              </option>
              <option value="USER" disabled={!user.hasIdentity}>
                USER {!user.hasIdentity ? '(no identity)' : ''}
              </option>
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            {isCurrentUser && (
              <span className="text-sm text-gray-500">Cannot change your own role</span>
            )}
          </div>
        </div>
      </div>

      {/* Recent sessions */}
      {user.sessions.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <h2 className="font-semibold text-gray-900">Recent Sessions</h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {user.sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="font-medium text-gray-900">{session.scenario?.name ?? 'Custom scenario'}</div>
                  <div className="text-sm text-gray-500">
                    {session.totalMessages} messages &middot; {session.status.toLowerCase()}
                  </div>
                </div>
                <div className="text-sm text-gray-500">{formatRelativeTime(session.startedAt)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Linked invitations */}
      {user.invitationsLinked.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <h2 className="font-semibold text-gray-900">Linked Invitations</h2>
          </div>
          <ul className="divide-y divide-gray-200">
            {user.invitationsLinked.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="font-medium text-gray-900">
                    {inv.label || inv.token.slice(0, 8)}...
                  </div>
                  <div className="text-sm text-gray-500">{inv.scenario?.name || 'No scenario'}</div>
                </div>
                <div className="text-sm text-gray-500">
                  {inv.claimedAt ? `Claimed ${formatRelativeTime(inv.claimedAt)}` : 'Not claimed'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Role change confirmation modal */}
      {showRoleConfirm && pendingRole && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close is intentional UX
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={cancelModal}
          role="presentation"
        >
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled via document listener */}
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-change-title"
          >
            <h3 id="role-change-title" className="text-lg font-semibold text-gray-900">
              Confirm Role Change
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to change this user's role from{' '}
              <span className="font-semibold">{user.role}</span> to{' '}
              <span className="font-semibold">{pendingRole}</span>?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRoleConfirm(false);
                  setPendingRole(null);
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRoleChange}
                disabled={updateRoleMutation.isPending}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {updateRoleMutation.isPending ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
