import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTRPC } from '../../api/trpc';

export function InvitationList() {
  const [scenarioId, setScenarioId] = useState<number | ''>('');
  const [presetName, setPresetName] = useState('');
  const [label, setLabel] = useState('');
  const [allowCustomScenario, setAllowCustomScenario] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
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

  const invitationListQueryKey = trpc.invitation.list.queryOptions().queryKey;
  const createMutation = useMutation({
    ...trpc.invitation.create.mutationOptions(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: invitationListQueryKey });
      setLabel('');
      // Auto-copy the new invitation link
      copyLink(data.token);
    },
  });

  const defaultPreset = presets?.find((p) => p.isDefault)?.name || presets?.[0]?.name || '';
  const effectivePreset = presetName || defaultPreset;

  // Can create if we have a preset AND (a scenario OR custom mode)
  const canCreate = !!effectivePreset && (!!scenarioId || allowCustomScenario);

  const handleCreate = () => {
    if (!effectivePreset) return;
    if (!scenarioId && !allowCustomScenario) return;

    createMutation.mutate({
      presetName: effectivePreset,
      scenarioId: scenarioId || undefined,
      allowCustomScenario,
      label: label || undefined,
    });
  };

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setCopyError(null);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopiedToken(null), 2000);
    } catch (error) {
      console.error('Failed to copy invitation link:', error);
      setCopyError(`Failed to copy link for ${token.slice(0, 8)}...`);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => setCopyError(null), 3000);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
        <p className="text-sm text-gray-500">Create and manage invitation links for user testing</p>
      </div>

      {/* Create invitation form */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow">
        <h2 className="mb-4 font-semibold text-gray-900">Create New Invitation</h2>

        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <label
              htmlFor="invite-scenario"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Scenario
            </label>
            <select
              id="invite-scenario"
              value={allowCustomScenario ? '' : scenarioId}
              onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : '')}
              disabled={allowCustomScenario}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">
                {allowCustomScenario ? 'User will describe...' : 'Select scenario...'}
              </option>
              {scenarios?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <input
              id="allow-custom"
              type="checkbox"
              checked={allowCustomScenario}
              onChange={(e) => {
                setAllowCustomScenario(e.target.checked);
                if (e.target.checked) {
                  setScenarioId(''); // Clear scenario when enabling custom
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="allow-custom" className="text-sm font-medium text-gray-700">
              Custom scenario
            </label>
          </div>

          <div className="min-w-[180px]">
            <label htmlFor="invite-quota" className="mb-1 block text-sm font-medium text-gray-700">
              Quota
            </label>
            <select
              id="invite-quota"
              value={effectivePreset}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {presets?.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label} ({(p.quota.tokens / 1000).toFixed(0)}k)
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[200px] flex-1">
            <label htmlFor="invite-label" className="mb-1 block text-sm font-medium text-gray-700">
              Label (optional)
            </label>
            <input
              id="invite-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Participant #1"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={createMutation.isPending || !canCreate}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-400"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Invitation'}
          </button>
        </div>

        {createMutation.error && (
          <p className="mt-3 text-sm text-red-600">
            Failed to create invitation. Please try again.
          </p>
        )}
      </div>

      {/* Copy error toast */}
      {copyError && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{copyError}</div>
      )}

      {/* Invitations list */}
      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <h2 className="font-semibold text-gray-900">Your Invitations</h2>
        </div>

        {loadingInvitations ? (
          <div className="p-6 text-center text-gray-500">Loading invitations...</div>
        ) : !invitations?.length ? (
          <div className="p-6 text-center text-gray-500">
            No invitations yet. Create one above to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {inv.label || `${inv.token.slice(0, 8)}...`}
                    </span>
                    {inv.claimedAt && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Claimed
                      </span>
                    )}
                    {inv.allowCustomScenario && !inv.scenario && (
                      <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    {inv.scenario ? (
                      <span>{inv.scenario.name}</span>
                    ) : inv.allowCustomScenario ? (
                      <span className="italic">User describes their own partner</span>
                    ) : null}
                    <span>
                      {inv.sessionCount} session{inv.sessionCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copyLink(inv.token)}
                  className="ml-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {copiedToken === inv.token ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
