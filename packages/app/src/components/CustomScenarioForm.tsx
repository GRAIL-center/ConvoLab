/**
 * CustomScenarioForm - Shared component for creating custom conversation scenarios.
 *
 * Handles the full flow:
 * 1. Description input with character count
 * 2. Elaboration with animated loading states
 * 3. Preview display with name/persona
 * 4. "Try again" flow for revisions
 * 5. Error/refusal handling
 *
 * Also exports:
 * - useElaboration hook for custom integrations
 * - AnimatedEllipsis component
 * - ELABORATION_STEPS array
 *
 * Used by:
 * - Invite.tsx (guests claiming custom invitations)
 * - ScenarioList.tsx (staff quick-start)
 */
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTRPC } from '../api/trpc';

export const ELABORATION_STEPS = [
  'Understanding your scenario',
  'Creating your conversation partner',
  'Preparing coaching guidance',
];

export interface ElaboratedScenario {
  name: string;
  persona: string;
  partnerPrompt: string;
  coachPrompt: string;
}

interface CustomScenarioFormProps {
  /** Called when user confirms the elaborated scenario */
  onConfirm: (description: string, elaborated: ElaboratedScenario) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Whether the confirm action is in progress */
  isConfirming?: boolean;
  /** Label for the confirm button (default: "Start Conversation") */
  confirmLabel?: string;
  /** Label while confirming (default: "Starting...") */
  confirmingLabel?: string;
}

export function AnimatedEllipsis() {
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

/**
 * Hook for managing custom scenario elaboration state.
 * Use this when you need more control over the UI than CustomScenarioForm provides.
 */
export function useElaboration() {
  const trpc = useTRPC();
  const [description, setDescription] = useState('');
  const [elaborationStep, setElaborationStep] = useState(0);
  const [elaborated, setElaborated] = useState<ElaboratedScenario | null>(null);
  const [refusalReason, setRefusalReason] = useState<string | null>(null);

  const elaborate = useMutation({
    ...trpc.scenario.elaborate.mutationOptions(),
    onSuccess: (data) => {
      if (data.success) {
        setRefusalReason(null);
        setElaborated({
          name: data.name,
          persona: data.persona,
          partnerPrompt: data.partnerPrompt,
          coachPrompt: data.coachPrompt,
        });
      } else {
        setRefusalReason(data.refusalReason);
        setElaborated(null);
      }
    },
  });

  // Cycle through elaboration steps while elaborating
  useEffect(() => {
    if (!elaborate.isPending) {
      setElaborationStep(0);
      return;
    }

    const interval = setInterval(() => {
      setElaborationStep((prev) => (prev < ELABORATION_STEPS.length - 1 ? prev + 1 : prev));
    }, 1500);

    return () => clearInterval(interval);
  }, [elaborate.isPending]);

  const canElaborate = description.trim().length >= 10 && description.length <= 2000;

  const handleElaborate = useCallback(() => {
    if (!canElaborate) return;
    elaborate.mutate({ description: description.trim() });
  }, [canElaborate, description, elaborate]);

  const reset = useCallback(() => {
    setElaborated(null);
    setRefusalReason(null);
    elaborate.reset();
  }, [elaborate]);

  return {
    // State
    description,
    setDescription,
    elaborated,
    refusalReason,
    elaborationStep,
    canElaborate,
    // Mutation state
    isPending: elaborate.isPending,
    error: elaborate.error,
    // Actions
    elaborate: handleElaborate,
    reset,
  };
}

export function CustomScenarioForm({
  onConfirm,
  onCancel,
  isConfirming = false,
  confirmLabel = 'Start Conversation',
  confirmingLabel = 'Starting...',
}: CustomScenarioFormProps) {
  const {
    description,
    setDescription,
    elaborated,
    refusalReason,
    elaborationStep,
    canElaborate,
    isPending,
    error,
    elaborate,
    reset,
  } = useElaboration();

  const handleConfirm = () => {
    if (!elaborated) return;
    onConfirm(description.trim(), elaborated);
  };

  // Preview state - show the elaborated result
  if (elaborated) {
    return (
      <div>
        <h3 className="text-xl font-bold text-gray-900">{elaborated.name}</h3>
        <p className="mt-1 text-gray-600">Talking with: {elaborated.persona}</p>

        <div className="mt-4 rounded-md bg-purple-50 p-4">
          <p className="text-sm text-purple-700">
            Based on: "{description.slice(0, 100)}
            {description.length > 100 ? '...' : ''}"
          </p>
        </div>

        <p className="mt-4 text-sm text-gray-600">
          Ready to start? You'll practice with this partner while a coach provides guidance.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={isConfirming}
            className="flex-1 rounded-md border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirming}
            className="flex-1 rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isConfirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    );
  }

  // Refusal state - AI declined, let user revise
  if (refusalReason) {
    return (
      <div>
        <h3 className="text-xl font-bold text-gray-900">Let's Try Something Else</h3>

        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{refusalReason}</p>
        </div>

        <div className="mt-4">
          <label htmlFor="description-revise" className="block text-sm font-medium text-gray-700">
            Revise your description:
          </label>
          <textarea
            id="description-revise"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block min-h-[120px] w-full rounded-md border border-gray-400 bg-gray-50 p-3 shadow-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500"
            maxLength={2000}
            disabled={isPending}
          />
          <p className="mt-2 text-sm text-gray-500">
            Try describing a realistic conversation you'd like to practice—like a difficult
            coworker, family member, or someone you need to have a tough talk with.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={elaborate}
            disabled={isPending || !canElaborate}
            className="flex-1 rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isPending ? (
              <span>
                {ELABORATION_STEPS[elaborationStep]}
                <AnimatedEllipsis />
              </span>
            ) : (
              'Try Again'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Initial state - description input
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900">Describe Your Conversation Partner</h3>
      <p className="mt-2 text-gray-600">
        Tell us about the person you want to practice talking to. Be specific about their
        personality, your relationship, and the situation.
      </p>

      <div className="mt-4">
        <label htmlFor="description-input" className="block text-sm font-medium text-gray-700">
          Who do you want to practice with?
        </label>
        <textarea
          id="description-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Example: My manager who micromanages everything and doesn't trust me to do my job. They constantly check in and question my decisions."
          className="mt-1 block min-h-[120px] w-full rounded-md border border-gray-400 bg-gray-50 p-3 shadow-sm focus:border-blue-500 focus:bg-white focus:ring-blue-500"
          maxLength={2000}
          disabled={isPending}
        />
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>
            {description.length < 10 && description.length > 0
              ? `${10 - description.length} more characters needed`
              : 'At least 10 characters'}
          </span>
          <span>{description.length}/2000</span>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3">
          <p className="text-center text-sm text-red-600">
            {error.message || 'Failed to create partner. Please try again.'}
          </p>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={elaborate}
          disabled={isPending || !canElaborate}
          className="flex-1 rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {isPending ? (
            <span>
              {ELABORATION_STEPS[elaborationStep]}
              <AnimatedEllipsis />
            </span>
          ) : (
            'Preview Partner'
          )}
        </button>
      </div>
    </div>
  );
}
