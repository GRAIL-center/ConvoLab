import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import type { AppRouter } from './api/trpc';
import { TRPCProvider, useTRPC } from './api/trpc';

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
              <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
                <p className="text-gray-600">Select a scenario to begin practicing.</p>
              </div>
            </main>
          </div>
        </BrowserRouter>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
