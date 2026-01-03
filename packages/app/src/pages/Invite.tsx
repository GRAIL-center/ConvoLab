import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import { SignOutConfirmDialog } from '../components/SignOutConfirmDialog';

export function Invite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
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

      // Navigate to conversation
      navigate(`/conversation/${data.sessionId}`);
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
    try {
      await fetch(url, { method: 'POST' });
      setShowSignOutConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['invitation', 'validate'] });
    } catch (error) {
      console.error('Failed to sign out:', error);
    }
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
        <SignOutConfirmDialog
          hasUsage={hasUsage}
          onSignOut={handleSignOut}
          onCancel={() => setShowSignOutConfirm(false)}
        />
      )}
    </div>
  );
}
