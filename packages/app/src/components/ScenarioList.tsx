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
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import { CustomScenarioForm, type ElaboratedScenario } from './CustomScenarioForm';

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
      tabIndex={-1}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 id="modal-title" className="text-lg font-semibold text-gray-900 mb-2">
          {scenario.name}
        </h3>
        <p className="text-sm text-gray-600 mb-4">Choose a token quota for this conversation:</p>

        {presetsLoading ? (
          <p className="text-gray-500 text-sm">Loading presets...</p>
        ) : (
          <div className="space-y-2 mb-4">
            {presets?.map((preset) => (
              <button
                key={preset.name}
                type="button"
                aria-pressed={selectedPreset === preset.name}
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

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

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

interface CustomScenarioModalProps {
  onClose: () => void;
}

function CustomScenarioModal({ onClose }: CustomScenarioModalProps) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [confirmedScenario, setConfirmedScenario] = useState<{
    description: string;
    elaborated: ElaboratedScenario;
  } | null>(null);
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

  const handleConfirm = (description: string, elaborated: ElaboratedScenario) => {
    setConfirmedScenario({ description, elaborated });
  };

  const handleStart = () => {
    if (!selectedPreset || !confirmedScenario) return;
    setError(null);
    startSession.mutate({
      presetName: selectedPreset,
      customDescription: confirmedScenario.description,
      elaborated: confirmedScenario.elaborated,
    });
  };

  const handleBack = () => {
    setConfirmedScenario(null);
    setSelectedPreset(null);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-modal-title"
      tabIndex={-1}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
        {!confirmedScenario ? (
          // Step 1: Description input and elaboration (using shared component)
          <CustomScenarioForm
            onConfirm={handleConfirm}
            onCancel={onClose}
            confirmLabel="Next"
            confirmingLabel="Next"
          />
        ) : (
          // Step 2: Preset selection
          <>
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-xs text-green-600 font-medium mb-1">Your conversation partner:</p>
              <p className="text-sm font-semibold text-gray-900">
                {confirmedScenario.elaborated.name}
              </p>
              <p className="text-sm text-gray-600 mt-1">{confirmedScenario.elaborated.persona}</p>
              <button
                type="button"
                onClick={handleBack}
                className="mt-2 text-xs text-green-700 hover:text-green-800 underline"
              >
                Edit description
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-2">Choose a token quota:</p>
            {presetsLoading ? (
              <p className="text-gray-500 text-sm">Loading presets...</p>
            ) : (
              <div className="space-y-2 mb-4">
                {presets?.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={selectedPreset === preset.name}
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

            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

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
          </>
        )}
      </div>
    </div>
  );
}

export function ScenarioList() {
  const trpc = useTRPC();
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const { data: scenarios, isLoading, isError } = useQuery(trpc.scenario.list.queryOptions());

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

        {/* Create Your Own card */}
        <button
          type="button"
          onClick={() => setShowCustomModal(true)}
          className="text-left rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 p-6 shadow hover:shadow-md hover:border-indigo-300 border border-dashed border-indigo-200 transition-all"
        >
          <h2 className="text-lg font-semibold text-indigo-900">Create Your Own</h2>
          <p className="mt-2 text-sm text-indigo-700">
            Describe any conversation partner you want to practice with.
          </p>
          <div className="mt-4 rounded bg-white/60 px-3 py-2">
            <p className="text-xs text-indigo-500">You'll describe:</p>
            <p className="text-sm text-indigo-800">Anyone you need to talk to</p>
          </div>
        </button>
      </div>

      {selectedScenario && (
        <PresetModal scenario={selectedScenario} onClose={() => setSelectedScenario(null)} />
      )}

      {showCustomModal && <CustomScenarioModal onClose={() => setShowCustomModal(false)} />}
    </>
  );
}
