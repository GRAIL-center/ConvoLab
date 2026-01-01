import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import type { AppRouter } from './api/trpc';
import { TRPCProvider, useTRPC } from './api/trpc';
import { Invite } from './pages/Invite';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
    },
  },
});

const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
});

function HamburgerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

function ScenarioList() {
  const trpc = useTRPC();
  const { data: scenarios, isLoading } = useQuery(trpc.scenario.list.queryOptions());

  if (isLoading) {
    return <p className="text-gray-500">Loading scenarios...</p>;
  }

  if (!scenarios?.length) {
    return <p className="text-gray-500">No scenarios available.</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {scenarios.map((scenario) => (
        <div
          key={scenario.id}
          className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">{scenario.name}</h2>
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">{scenario.description}</p>
          <div className="mt-4 rounded bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">You'll talk with:</p>
            <p className="text-sm text-gray-700">{scenario.partnerPersona}</p>
          </div>
          <button
            type="button"
            disabled
            className="mt-4 w-full rounded bg-gray-200 px-4 py-2 text-sm text-gray-500 cursor-not-allowed"
          >
            Coming soon
          </button>
        </div>
      ))}
    </div>
  );
}

function HomePage() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.auth.me.queryOptions());
  const isAdmin = data?.user?.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-7xl py-6 px-4 sm:px-6 lg:px-8">
      {isAdmin && <AdminPanel />}
      <h2 className="text-lg font-medium text-gray-900 mb-6">
        Select a scenario to begin practicing
      </h2>
      <ScenarioList />
    </div>
  );
}

function AdminPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [scenarioId, setScenarioId] = useState<number | ''>('');
  const [presetName, setPresetName] = useState('');
  const [label, setLabel] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

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
      qc.invalidateQueries({ queryKey: [['invitation', 'list']] });
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
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="mb-8 rounded-lg bg-amber-50 border border-amber-200">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="font-medium text-amber-900">Admin: Create Invitations</span>
        <span className="text-amber-600">{isOpen ? '▼' : '▶'}</span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          {/* Create form */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-amber-700 mb-1">Scenario</label>
              <select
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
              <label className="block text-xs text-amber-700 mb-1">Quota</label>
              <select
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
              <label className="block text-xs text-amber-700 mb-1">Label (optional)</label>
              <input
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
            <p className="text-sm text-red-600">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create invitation'}
            </p>
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

function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const trpc = useTRPC();

  const { data, isLoading, refetch } = useQuery(trpc.auth.me.queryOptions());

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsOpen(false);
    refetch();
  };

  const { user, mergedFrom } = data || {};

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md p-2 hover:bg-gray-100"
      >
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <HamburgerIcon />
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
            <div className="p-4">
              {mergedFrom && (
                <div className="mb-3 rounded bg-blue-100 p-2 text-sm text-blue-800">
                  Session merged into this account.
                </div>
              )}

              {isLoading ? (
                <p className="text-gray-500">Loading...</p>
              ) : user ? (
                <div>
                  <div className="flex items-center gap-3 border-b pb-3">
                    {user.avatarUrl && (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="h-10 w-10 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{user.name}</p>
                      <p className="truncate text-sm text-gray-500">
                        {user.externalIdentities?.[0]?.email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-gray-400">
                    <p>Role: {user.role}</p>
                    <p>ID: {user.id}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="mt-3 w-full rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-sm text-gray-600">Not signed in</p>
                  <a
                    href="/api/auth/google"
                    className="block rounded bg-blue-600 px-4 py-2 text-center text-sm text-white hover:bg-blue-700"
                  >
                    Sign in with Google
                  </a>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow">
              <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                  Conversation Coach
                </h1>
                <UserMenu />
              </div>
            </header>
            <main>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/invite/:token" element={<Invite />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
