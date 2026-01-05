/**
 * ScenarioList - displays available conversation scenarios.
 *
 * For STAFF+ users: Cards are clickable and open a modal to select quota preset,
 * then start a new conversation session.
 *
 * For regular users: Not currently shown (invitation-only flow).
 * Self-service session creation is a future feature - see docs/plans/.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTRPC } from '../api/trpc';

interface Scenario {
  id: number;
  name: string;
  description: string | null;
  partnerPersona: string;
}

interface PresetModalProps {
  scenario: Scenario;
  onClose: () => void;
}

function PresetModal({ scenario, onClose }: PresetModalProps) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: presets, isLoading: presetsLoading } = useQuery(
    trpc.invitation.getPresets.queryOptions()
  );

  const startSession = useMutation(
    trpc.session.startNew.mutationOptions({
      onSuccess: (data) => {
        navigate(`/conversation/${data.sessionId}`);
      },
      onError: (err) => {
        setError(err.message);
      },
    })
  );

  const handleStart = () => {
    if (!selectedPreset) return;
    setError(null);
    startSession.mutate({
      scenarioId: scenario.id,
      presetName: selectedPreset,
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 id="modal-title" className="text-lg font-semibold text-gray-900 mb-2">
          {scenario.name}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Choose a token quota for this conversation:
        </p>

        {presetsLoading ? (
          <p className="text-gray-500 text-sm">Loading presets...</p>
        ) : (
          <div className="space-y-2 mb-4">
            {presets?.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setSelectedPreset(preset.name)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  selectedPreset === preset.name
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium text-gray-900">{preset.label}</div>
                <div className="text-sm text-gray-500">
                  {preset.quota.tokens.toLocaleString()} tokens
                  {preset.description && ` — ${preset.description}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-600 text-sm mb-4">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedPreset || startSession.isPending}
            className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {startSession.isPending ? 'Starting...' : 'Start conversation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScenarioList() {
  const trpc = useTRPC();
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);

  const { data: scenarios, isLoading, isError } = useQuery(
    trpc.scenario.list.queryOptions()
  );

  if (isLoading) {
    return <p className="text-gray-500">Loading scenarios...</p>;
  }

  if (isError) {
    return <p className="text-red-500">Error loading scenarios. Please try again later.</p>;
  }

  if (!scenarios?.length) {
    return <p className="text-gray-500">No scenarios available.</p>;
  }

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => setSelectedScenario(scenario)}
            className="text-left rounded-lg bg-white p-6 shadow hover:shadow-md hover:border-blue-300 border border-transparent transition-all"
          >
            <h2 className="text-lg font-semibold text-gray-900">{scenario.name}</h2>
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">{scenario.description}</p>
            <div className="mt-4 rounded bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-500">You'll talk with:</p>
              <p className="text-sm text-gray-700">{scenario.partnerPersona}</p>
            </div>
          </button>
        ))}
      </div>

      {selectedScenario && (
        <PresetModal
          scenario={selectedScenario}
          onClose={() => setSelectedScenario(null)}
        />
      )}
    </>
  );
}
