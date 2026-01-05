import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import { SignOutConfirmDialog } from '../components/SignOutConfirmDialog';

const ELABORATION_STEPS = [
  'Understanding your scenario',
  'Creating your conversation partner',
  'Preparing coaching guidance',
];

function AnimatedEllipsis() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => (prev + 1) % 3);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Fixed-width ellipsis: ".  " → ".. " → "..."
  const frames = ['.\u00A0\u00A0', '..\u00A0', '...'];
  return <span>{frames[step]}</span>;
}

export function Invite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [customDescription, setCustomDescription] = useState('');
  const [elaborationStep, setElaborationStep] = useState(0);
  // Preview state for custom scenarios
  const [elaborationPreview, setElaborationPreview] = useState<{
    persona: string;
    partnerPrompt: string;
    coachPrompt: string;
  } | null>(null);
  // Refusal reason when AI declines to create the scenario
  const [refusalReason, setRefusalReason] = useState<string | null>(null);

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

  // Elaborate mutation (for custom scenario preview)
  const elaborateMutation = useMutation({
    ...trpc.scenario.elaborate.mutationOptions(),
    onSuccess: (data) => {
      if (data.success) {
        setRefusalReason(null);
        setElaborationPreview({
          persona: data.persona,
          partnerPrompt: data.partnerPrompt,
          coachPrompt: data.coachPrompt,
        });
      } else {
        // AI declined to create this scenario
        setRefusalReason(data.refusalReason);
      }
    },
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

  // Cycle through elaboration steps while elaborating
  useEffect(() => {
    if (!elaborateMutation.isPending) {
      setElaborationStep(0);
      return;
    }

    const interval = setInterval(() => {
      setElaborationStep((prev) => (prev < ELABORATION_STEPS.length - 1 ? prev + 1 : prev));
    }, 1500);

    return () => clearInterval(interval);
  }, [elaborateMutation.isPending]);

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

  // Determine if this is a custom scenario invitation
  const isCustomScenario = invitation?.allowCustomScenario && !invitation?.scenario;
  const canElaborate = customDescription.trim().length >= 10 && customDescription.length <= 2000;

  // For custom scenarios: first elaborate to preview, then claim
  const handleCreatePartner = () => {
    elaborateMutation.mutate({ description: customDescription.trim() });
  };

  const handleStartConversation = () => {
    if (isCustomScenario && elaborationPreview) {
      // Custom scenario with preview - pass pre-elaborated prompts
      claimMutation.mutate({
        token,
        customDescription: customDescription.trim(),
        elaborated: elaborationPreview,
      });
    } else {
      // Predefined scenario
      claimMutation.mutate({ token });
    }
  };

  const handleTryAgain = () => {
    setElaborationPreview(null);
    setRefusalReason(null);
    elaborateMutation.reset();
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
        ) : isCustomScenario ? (
          elaborationPreview ? (
            // Show preview after elaboration
            <>
              <h1 className="text-2xl font-bold text-gray-900">Your Conversation Partner</h1>
              <div className="mt-4 rounded-md bg-purple-50 p-4">
                <h3 className="font-medium text-purple-900">{elaborationPreview.persona}</h3>
                <p className="mt-2 text-sm text-purple-700">
                  Based on: "{customDescription.slice(0, 100)}
                  {customDescription.length > 100 ? '...' : ''}"
                </p>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Ready to start? You'll practice with this partner while a coach provides guidance.
              </p>
            </>
          ) : refusalReason ? (
            // Show refusal with option to revise
            <>
              <h1 className="text-2xl font-bold text-gray-900">Let's Try Something Else</h1>
              <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 p-4">
                <p className="text-sm text-amber-800">{refusalReason}</p>
              </div>
              <div className="mt-4">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Revise your description:
                </label>
                <textarea
                  id="description"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 min-h-[120px] p-3"
                  maxLength={2000}
                  disabled={elaborateMutation.isPending}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Try describing a realistic conversation you'd like to practice—like a difficult
                  coworker, family member, or someone you need to have a tough talk with.
                </p>
              </div>
            </>
          ) : (
            // Show description input
            <>
              <h1 className="text-2xl font-bold text-gray-900">
                Describe Your Conversation Partner
              </h1>
              <p className="mt-2 text-gray-600">
                Tell us about the person you want to practice talking to. Be specific about their
                personality, your relationship, and the situation.
              </p>

              <div className="mt-4">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Who do you want to practice with?
                </label>
                <textarea
                  id="description"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="Example: My manager who micromanages everything and doesn't trust me to do my job. They constantly check in and question my decisions."
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 min-h-[120px] p-3"
                  maxLength={2000}
                  disabled={elaborateMutation.isPending}
                />
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>
                    {customDescription.length < 10 && customDescription.length > 0
                      ? `${10 - customDescription.length} more characters needed`
                      : 'At least 10 characters'}
                  </span>
                  <span>{customDescription.length}/2000</span>
                </div>
              </div>
            </>
          )
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

        {/* Button section - different flows for custom vs predefined scenarios */}
        {isCustomScenario && !elaborationPreview ? (
          // Custom scenario: first step - create partner (or retry after refusal)
          <button
            type="button"
            onClick={handleCreatePartner}
            disabled={elaborateMutation.isPending || !canElaborate}
            className="mt-6 w-full rounded-md bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {elaborateMutation.isPending ? (
              <span>
                {ELABORATION_STEPS[elaborationStep]}
                <AnimatedEllipsis />
              </span>
            ) : refusalReason ? (
              'Try Again'
            ) : (
              'Create Partner'
            )}
          </button>
        ) : isCustomScenario && elaborationPreview ? (
          // Custom scenario: second step - confirm or retry
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleTryAgain}
              disabled={claimMutation.isPending}
              className="flex-1 rounded-md border border-gray-300 px-4 py-3 text-gray-700 font-medium hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={handleStartConversation}
              disabled={claimMutation.isPending || invitation.quota.remaining === 0}
              className="flex-1 rounded-md bg-blue-600 px-4 py-3 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {claimMutation.isPending ? 'Starting...' : 'Start Conversation'}
            </button>
          </div>
        ) : (
          // Predefined scenario: direct start
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
        )}

        {/* Error messages */}
        {elaborateMutation.error && (
          <div className="mt-3 rounded-md bg-red-50 p-3">
            <p className="text-center text-sm text-red-600">
              {elaborateMutation.error.message || 'Failed to create partner. Please try again.'}
            </p>
          </div>
        )}
        {claimMutation.error && (
          <div className="mt-3 rounded-md bg-red-50 p-3">
            <p className="text-center text-sm text-red-600">
              {claimMutation.error.message || 'Failed to start conversation. Please try again.'}
            </p>
          </div>
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
