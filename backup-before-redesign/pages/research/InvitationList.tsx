import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTRPC } from '../../api/trpc';

export function InvitationList() {
  const [scenarioId, setScenarioId] = useState<number | ''>('');
  const [presetName, setPresetName] = useState('');
  const [label, setLabel] = useState('');
  const [allowCustomScenario, setAllowCustomScenario] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const trpc = useTRPC();
  const qc = useQueryClient();

  // Use unknown casting instead of explicit any to satisfy the linter
  const { data: scenarios } = useQuery({
    ...trpc.scenario.list.queryOptions(),
  }) as unknown as { data: { id: number; name: string }[] | undefined };

  const { data: presets } = useQuery({
    ...trpc.invitation.getPresets.queryOptions(),
  }) as unknown as {
    data:
      | { name: string; label: string; isDefault?: boolean; quota: { tokens: number } }[]
      | undefined;
  };

  const { data: invitations, isLoading: loadingInvitations } = useQuery({
    ...trpc.invitation.list.queryOptions(),
  }) as unknown as {
    data:
      | {
          id: string;
          token: string;
          label?: string;
          claimedAt?: string;
          allowCustomScenario?: boolean;
          scenario?: { name: string };
        }[]
      | undefined;
    isLoading: boolean;
  };

  const createMutation = useMutation({
    ...trpc.invitation.create.mutationOptions(),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: trpc.invitation.list.queryOptions().queryKey });
      setLabel('');

      // Cast the data inside the function to avoid the "any" lint error
      // while satisfying the compiler
      const result = data as { token: string };
      if (result?.token) {
        void copyLink(result.token);
      }
    },
  });
  const scenarioList = scenarios || [];
  const presetList = presets || [];
  const invitationList = invitations || [];

  const defaultPreset = presetList.find((p) => p.isDefault)?.name || presetList[0]?.name || '';
  const effectivePreset = presetName || defaultPreset;
  const canCreate = !!effectivePreset && (!!scenarioId || allowCustomScenario);

  const handleCreate = () => {
    if (!canCreate) return;
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
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      setCopyError('Failed to copy link');
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopyError(null), 3000);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
        <p className="text-sm text-gray-500">Create and manage invitation links</p>
      </div>

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow">
        <h2 className="mb-4 font-semibold text-gray-900">Create New Invitation</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            {/* Added htmlFor and id for accessibility */}
            <label
              htmlFor="scenario-select"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Scenario
            </label>
            <select
              id="scenario-select"
              value={allowCustomScenario ? '' : scenarioId}
              onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : '')}
              disabled={allowCustomScenario}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
            >
              <option value="">
                {allowCustomScenario ? 'User describes...' : 'Select scenario...'}
              </option>
              {scenarioList.map((s) => (
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
                if (e.target.checked) setScenarioId('');
              }}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <label htmlFor="allow-custom" className="text-sm font-medium text-gray-700">
              Custom scenario
            </label>
          </div>

          <div className="min-w-[180px]">
            {/* Added htmlFor and id for accessibility */}
            <label htmlFor="quota-select" className="mb-1 block text-sm font-medium text-gray-700">
              Quota
            </label>
            <select
              id="quota-select"
              value={effectivePreset}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {presetList.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.label} ({(p.quota.tokens / 1000).toFixed(0)}k)
                </option>
              ))}
            </select>
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
      </div>

      {copyError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{copyError}</div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow">
        {loadingInvitations ? (
          <div className="p-6 text-center text-gray-500">Loading invitations...</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {invitationList.map((inv) => (
              <Link
                key={inv.id}
                to={`/research/invitations/${inv.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50"
              >
                <div className="flex-shrink-0 rounded border border-gray-200 p-1">
                  <QRCodeSVG value={`${window.location.origin}/invite/${inv.token}`} size={40} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {inv.label || inv.token.slice(0, 8)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {inv.scenario?.name ||
                      (inv.allowCustomScenario ? 'User-defined' : 'No Scenario')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void copyLink(inv.token);
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  {copiedToken === inv.token ? 'Copied!' : 'Copy'}
                </button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
