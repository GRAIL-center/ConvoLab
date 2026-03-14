/**
 * ScenarioList - displays available conversation scenarios.
 *
 * For STAFF+ users: Cards are clickable and open a modal to select quota preset,
 * then start a new conversation session.
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

interface Preset {
  name: string;
  label: string;
  description?: string;
  quota: {
    tokens: number;
  };
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
    startSession.mutate({ scenarioId: scenario.id, presetName: selectedPreset });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
    >
      <div className="rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6
                      bg-white dark:bg-[rgba(40,40,40,0.98)]
                      border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]">
        <h3 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-[#EBEBEB] mb-1">
          {scenario.name}
        </h3>
        <p className="text-sm text-gray-500 dark:text-[#A0A0A0] mb-4">Choose a token quota for this conversation:</p>

        {presetsLoading ? (
          <p className="text-[#A0A0A0] text-sm">Loading presets...</p>
        ) : (
          <div className="space-y-2 mb-4">
            {presets && Array.isArray(presets) && (presets as Preset[]).map((preset) => (
              <button
                key={preset.name}
                type="button"
                aria-pressed={selectedPreset === preset.name}
                onClick={() => setSelectedPreset(preset.name)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                  selectedPreset === preset.name
                    ? 'border-[rgba(130,167,161,0.6)] dark:border-[rgba(134,199,194,0.5)] bg-[rgba(130,167,161,0.1)] dark:bg-[rgba(134,199,194,0.1)]'
                    : 'border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)] hover:border-[rgba(130,167,161,0.4)] dark:hover:border-[rgba(212,232,229,0.2)] hover:bg-[rgba(130,167,161,0.05)] dark:hover:bg-[rgba(212,232,229,0.04)]'
                }`}
              >
                <div className="font-medium text-gray-900 dark:text-[#EBEBEB]">{preset.label}</div>
                <div className="text-sm text-gray-500 dark:text-[#A0A0A0]">
                  {preset.quota.tokens.toLocaleString()} tokens
                  {preset.description && ` — ${preset.description}`}
                </div>
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-red-500 dark:text-[#FCA5A5] text-sm mb-4">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-[#A0A0A0]
                       hover:bg-[rgba(130,167,161,0.1)] dark:hover:bg-[rgba(212,232,229,0.06)]
                       rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedPreset || startSession.isPending}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all
                       bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[rgba(40,90,80,1)] dark:text-[#EBEBEB]
                       hover:bg-[rgba(130,167,161,0.35)] dark:hover:bg-[rgba(212,232,229,0.2)]
                       disabled:opacity-40 disabled:cursor-not-allowed"
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
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-modal-title"
      tabIndex={-1}
    >
      <div className="rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6
                      bg-white dark:bg-[rgba(40,40,40,0.98)]
                      border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]">
        {!confirmedScenario ? (
          <CustomScenarioForm
            onConfirm={handleConfirm}
            onCancel={onClose}
            confirmLabel="Next"
            confirmingLabel="Next"
          />
        ) : (
          <>
            <div className="mb-4 rounded-xl bg-[rgba(134,199,194,0.1)] dark:bg-[rgba(134,199,194,0.08)]
                            border border-[rgba(134,199,194,0.3)] dark:border-[rgba(134,199,194,0.2)] p-4">
              <p className="text-xs text-[rgba(60,140,130,1)] dark:text-[rgba(134,199,194,0.8)] font-medium mb-1">Your conversation partner:</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-[#EBEBEB]">
                {confirmedScenario.elaborated.name}
              </p>
              <p className="text-sm text-gray-600 dark:text-[#B5B5B5] mt-1">{confirmedScenario.elaborated.persona}</p>
              <button
                type="button"
                onClick={handleBack}
                className="mt-2 text-xs text-[rgba(60,140,130,1)] dark:text-[rgba(134,199,194,0.8)] hover:underline"
              >
                Edit description
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-[#A0A0A0] mb-2">Choose a token quota:</p>
            {presetsLoading ? (
              <p className="text-[#A0A0A0] text-sm">Loading presets...</p>
            ) : (
              <div className="space-y-2 mb-4">
                {presets && Array.isArray(presets) && (presets as Preset[]).map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    aria-pressed={selectedPreset === preset.name}
                    onClick={() => setSelectedPreset(preset.name)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      selectedPreset === preset.name
                        ? 'border-[rgba(130,167,161,0.6)] dark:border-[rgba(134,199,194,0.5)] bg-[rgba(130,167,161,0.1)] dark:bg-[rgba(134,199,194,0.1)]'
                        : 'border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)] hover:border-[rgba(130,167,161,0.4)] dark:hover:border-[rgba(212,232,229,0.2)] hover:bg-[rgba(130,167,161,0.05)] dark:hover:bg-[rgba(212,232,229,0.04)]'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-[#EBEBEB]">{preset.label}</div>
                    <div className="text-sm text-gray-500 dark:text-[#A0A0A0]">
                      {preset.quota.tokens.toLocaleString()} tokens
                      {preset.description && ` — ${preset.description}`}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {error && <p className="text-red-500 dark:text-[#FCA5A5] text-sm mb-4">{error}</p>}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-[#A0A0A0]
                           hover:bg-[rgba(130,167,161,0.1)] dark:hover:bg-[rgba(212,232,229,0.06)]
                           rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={!selectedPreset || startSession.isPending}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-all
                           bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                           text-[rgba(40,90,80,1)] dark:text-[#EBEBEB]
                           hover:bg-[rgba(130,167,161,0.35)] dark:hover:bg-[rgba(212,232,229,0.2)]
                           disabled:opacity-40 disabled:cursor-not-allowed"
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
    return <p className="text-gray-500 dark:text-[#A0A0A0]">Loading scenarios...</p>;
  }

  if (isError) {
    return <p className="text-red-500 dark:text-[#FCA5A5]">Error loading scenarios. Please try again later.</p>;
  }

  if (!scenarios || !Array.isArray(scenarios) || scenarios.length === 0) {
    return <p className="text-gray-500 dark:text-[#A0A0A0]">No scenarios available.</p>;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(scenarios as Scenario[]).map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => setSelectedScenario(scenario)}
            className="text-left rounded-2xl p-6 transition-all group
                       bg-white dark:bg-[rgba(40,40,40,0.9)]
                       border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                       hover:border-[rgba(130,167,161,0.5)] dark:hover:border-[rgba(212,232,229,0.25)]
                       hover:shadow-md dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]
                       shadow-sm"
          >
            <h2 className="text-base font-semibold text-gray-900 dark:text-[#EBEBEB]">{scenario.name}</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-[#A0A0A0] line-clamp-2 leading-relaxed">{scenario.description}</p>
            <div className="mt-4 flex items-baseline gap-2 text-sm">
              <span className="text-gray-400 dark:text-[#6B6B6B] whitespace-nowrap">You'll talk with:</span>
              <span className="font-semibold text-gray-700 dark:text-[#B5B5B5]">{scenario.partnerPersona}</span>
            </div>
          </button>
        ))}

        {/* Create Your Own card */}
        <button
          type="button"
          onClick={() => setShowCustomModal(true)}
          className="text-left rounded-2xl p-6 transition-all
                     bg-[rgba(130,167,161,0.08)] dark:bg-[rgba(212,232,229,0.05)]
                     border border-[rgba(130,167,161,0.3)] dark:border-[rgba(212,232,229,0.15)]
                     hover:border-[rgba(130,167,161,0.5)] dark:hover:border-[rgba(212,232,229,0.3)]
                     hover:bg-[rgba(130,167,161,0.12)] dark:hover:bg-[rgba(212,232,229,0.08)]
                     shadow-sm"
        >
          <h2 className="text-base font-semibold text-gray-800 dark:text-[#EBEBEB]">Create Your Own</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-[#A0A0A0] leading-relaxed">
            Describe any conversation partner you want to practice with.
          </p>
          <div className="mt-4 flex items-baseline gap-2 text-sm">
            <span className="text-gray-400 dark:text-[#6B6B6B] whitespace-nowrap">You'll talk with:</span>
            <span className="font-semibold text-gray-700 dark:text-[#B5B5B5]">Anyone you need to talk to</span>
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