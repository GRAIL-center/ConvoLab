import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTRPC } from '../api/trpc';

export function Invite() {
  const { token } = useParams<{ token: string }>();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Get current user to show appropriate sign-out messaging
  const { data: authData } = useQuery(trpc.auth.me.queryOptions());
  const user = authData?.user;
  const isGuest = user?.role === 'GUEST';
  const hasUsage = (user?.sessionCount ?? 0) > 0;

  const {
    data: invitation,
    isLoading,
    error,
  } = useQuery({
    ...trpc.invitation.validate.queryOptions({ token: token! }),
    enabled: !!token,
    retry: false,
  });

  const claimMutation = useMutation({
    ...trpc.invitation.claim.mutationOptions(),
    onSuccess: (data) => {
      // Invalidate auth query so UserMenu updates to show guest state
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      // TODO: Navigate to conversation page when it exists
      // For now, just show success state
      if (data.invitation.scenario) {
        // Would navigate to: /conversation/new?scenario=${data.invitation.scenario.id}
        alert(`Claimed! Scenario: ${data.invitation.scenario.name}`);
      }
    },
  });

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h2 className="text-lg font-medium text-red-800">Invalid Link</h2>
          <p className="mt-2 text-red-600">No invitation token provided.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="text-center text-gray-500">Loading invitation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <h2 className="text-lg font-medium text-red-800">Invalid Invitation</h2>
          <p className="mt-2 text-red-600">This invitation is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  const handleStartConversation = () => {
    claimMutation.mutate({ token });
  };

  const handleSignOut = async (unclaim = false) => {
    const url = unclaim ? '/api/auth/logout?unclaim=true' : '/api/auth/logout';
    await fetch(url, { method: 'POST' });
    setShowSignOutConfirm(false);
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    queryClient.invalidateQueries({ queryKey: ['invitation', 'validate'] });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        {invitation.scenario ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">{invitation.scenario.name}</h1>
            <p className="mt-2 text-gray-600">{invitation.scenario.description}</p>

            <div className="mt-4 rounded-md bg-gray-50 p-4">
              <h3 className="text-sm font-medium text-gray-700">You'll be talking with:</h3>
              <p className="mt-1 text-gray-600">{invitation.scenario.partnerPersona}</p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">Conversation Practice</h1>
            <p className="mt-2 text-gray-600">You've been invited to practice conversations.</p>
          </>
        )}

        <div className="mt-6 flex items-center justify-between rounded-md bg-blue-50 px-4 py-3">
          <span className="text-sm text-blue-700">{invitation.quota.label || 'Token quota'}</span>
          <span className="font-medium text-blue-900">
            {invitation.quota.remaining.toLocaleString()} /{' '}
            {invitation.quota.total.toLocaleString()} tokens
          </span>
        </div>

        {invitation.claimed && (
          <div className="mt-4 rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            This invitation has already been claimed. You can continue your conversation.
          </div>
        )}

        <button
          type="button"
          onClick={handleStartConversation}
          disabled={claimMutation.isPending || invitation.quota.remaining === 0}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {claimMutation.isPending
            ? 'Starting...'
            : invitation.quota.remaining === 0
              ? 'No quota remaining'
              : 'Start Conversation'}
        </button>

        {claimMutation.error && (
          <p className="mt-3 text-center text-sm text-red-600">
            Failed to start conversation. Please try again.
          </p>
        )}

        <div className="mt-6 border-t pt-4 space-y-2">
          <p className="text-center text-sm text-gray-500">
            Want to save your progress?{' '}
            <a href="/api/auth/google" className="text-blue-600 hover:underline">
              Sign in with Google
            </a>
          </p>
          {isGuest && (
            <p className="text-center text-xs text-gray-400">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(true)}
                className="hover:text-gray-600 underline"
              >
                Sign out
              </button>{' '}
              to free up this invitation
            </p>
          )}
        </div>
      </div>

      {/* Sign out confirmation dialog */}
      {showSignOutConfirm && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop for click-outside-to-close */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: escape handled by dialog */}
          <div
            className="fixed inset-0 z-30 bg-black bg-opacity-50"
            onClick={() => setShowSignOutConfirm(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
            {hasUsage ? (
              <>
                <h3 className="font-semibold text-gray-900">You have conversations</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Signing out will lose your conversation history. Sign in with Google to keep it.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <a
                    href="/api/auth/google"
                    className="rounded bg-blue-600 px-4 py-2 text-center text-sm text-white hover:bg-blue-700"
                  >
                    Sign in with Google
                  </a>
                  <button
                    type="button"
                    onClick={() => handleSignOut(false)}
                    className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    Sign out anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSignOutConfirm(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-gray-900">Sign out?</h3>
                <p className="mt-2 text-sm text-gray-600">
                  The invitation link will still work after you sign out.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleSignOut(true)}
                    className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSignOutConfirm(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
