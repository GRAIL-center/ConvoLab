import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTRPC } from '../api/trpc';

export function AdminPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [scenarioId, setScenarioId] = useState<number | ''>('');
  const [presetName, setPresetName] = useState('');
  const [label, setLabel] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const trpc = useTRPC();
  const qc = useQueryClient();

  const { data: scenarios } = useQuery(trpc.scenario.list.queryOptions());
  const { data: presets } = useQuery(trpc.invitation.getPresets.queryOptions());
  const { data: invitations, isLoading: loadingInvitations } = useQuery(
    trpc.invitation.list.queryOptions()
  );

  const createMutation = useMutation({
    ...trpc.invitation.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitation', 'list'] });
      setLabel('');
    },
  });

  const defaultPreset = presets?.find((p) => p.isDefault)?.name || presets?.[0]?.name || '';
  const effectivePreset = presetName || defaultPreset;

  const handleCreate = () => {
    if (!effectivePreset) return;
    createMutation.mutate({
      presetName: effectivePreset,
      scenarioId: scenarioId || undefined,
      label: label || undefined,
    });
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="admin-panel-content"
        className="w-full px-4 py-3 flex items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      >
        <span className="font-medium text-amber-900">Admin: Create Invitations</span>
        <span className="text-amber-600">{isOpen ? '▼' : '▶'}</span>
      </button>

      {isOpen && (
        <div id="admin-panel-content" className="px-4 pb-4 space-y-4">
          {/* Create form */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label htmlFor="invite-scenario" className="block text-xs text-amber-700 mb-1">
                Scenario
              </label>
              <select
                id="invite-scenario"
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : '')}
                className="rounded border-amber-300 text-sm px-2 py-1.5"
              >
                <option value="">Any scenario</option>
                {scenarios?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="invite-quota" className="block text-xs text-amber-700 mb-1">
                Quota
              </label>
              <select
                id="invite-quota"
                value={effectivePreset}
                onChange={(e) => setPresetName(e.target.value)}
                className="rounded border-amber-300 text-sm px-2 py-1.5"
              >
                {presets?.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.label} ({(p.quota.tokens / 1000).toFixed(0)}k)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label htmlFor="invite-label" className="block text-xs text-amber-700 mb-1">
                Label (optional)
              </label>
              <input
                id="invite-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Participant #1"
                className="w-full rounded border-amber-300 text-sm px-2 py-1.5"
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="rounded bg-amber-600 px-4 py-1.5 text-sm text-white hover:bg-amber-700 disabled:bg-amber-400"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Invitation'}
            </button>
          </div>

          {createMutation.error && (
            <p className="text-sm text-red-600">Failed to create invitation. Please try again.</p>
          )}

          {/* Invitations list */}
          <div className="border-t border-amber-200 pt-4">
            <h4 className="text-sm font-medium text-amber-900 mb-2">Your Invitations</h4>
            {loadingInvitations ? (
              <p className="text-sm text-amber-600">Loading...</p>
            ) : !invitations?.length ? (
              <p className="text-sm text-amber-600">No invitations yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {invitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{inv.label || inv.token.slice(0, 8)}...</span>
                      {inv.scenario && (
                        <span className="text-gray-500 ml-2">({inv.scenario.name})</span>
                      )}
                      {inv.claimedAt && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          Claimed
                        </span>
                      )}
                      <span className="text-gray-400 ml-2 text-xs">
                        {inv.sessionCount} session{inv.sessionCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyLink(inv.token)}
                      className="ml-2 text-amber-600 hover:text-amber-800 text-xs whitespace-nowrap"
                    >
                      {copiedToken === inv.token ? 'Copied!' : 'Copy link'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
