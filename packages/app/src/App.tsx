import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import type { AppRouter } from './api/trpc';
import { TRPCProvider } from './api/trpc';
import { UserMenu } from './components/UserMenu';
import { Telemetry } from './pages/admin/Telemetry';
import { Home } from './pages/Home';
import { Invite } from './pages/Invite';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
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
}

// For client-only apps, we can use module-level singletons
let browserQueryClient: QueryClient | undefined;
let browserTRPCClient: ReturnType<typeof makeTRPCClient> | undefined;

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

function getTRPCClient() {
  if (typeof window === 'undefined') return makeTRPCClient();
  if (!browserTRPCClient) browserTRPCClient = makeTRPCClient();
  return browserTRPCClient;
}

export function App() {
  const queryClient = getQueryClient();
  const trpcClient = getTRPCClient();

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
                <Route path="/" element={<Home />} />
                <Route path="/invite/:token" element={<Invite />} />
                <Route path="/admin/telemetry" element={<Telemetry />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
