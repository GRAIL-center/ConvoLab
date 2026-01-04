import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AppRouter } from './api/trpc';
import { TRPCProvider } from './api/trpc';
import { UserMenu } from './components/UserMenu';
import { AdminLayout } from './layouts/AdminLayout';
import { ResearchLayout } from './layouts/ResearchLayout';
import { Telemetry } from './pages/admin/Telemetry';
import { UserDetail } from './pages/admin/UserDetail';
import { UserList } from './pages/admin/UserList';
import { Conversation } from './pages/Conversation';
import { Home } from './pages/Home';
import { Invite } from './pages/Invite';
import { InvitationList } from './pages/research/InvitationList';

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

const siteBanner = import.meta.env.VITE_SITE_BANNER as string | undefined;

export function App() {
  const queryClient = getQueryClient();
  const trpcClient = getTRPCClient();

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Full-screen conversation page (no main header) */}
            <Route path="/conversation/:sessionId" element={<Conversation />} />

            {/* Admin area with sidebar layout */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<UserList />} />
              <Route path="users/:id" element={<UserDetail />} />
              <Route path="telemetry" element={<Telemetry />} />
            </Route>

            {/* Research area with sidebar layout */}
            <Route path="/research" element={<ResearchLayout />}>
              <Route index element={<Navigate to="invitations" replace />} />
              <Route path="invitations" element={<InvitationList />} />
            </Route>

            {/* Standard layout with header */}
            <Route
              path="*"
              element={
                <div className="min-h-screen bg-gray-50">
                  {siteBanner && (
                    <div
                      className="bg-amber-300 px-4 py-2 text-center text-sm font-medium text-black [&_a]:underline [&_a]:hover:text-amber-700"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: admin-controlled env var, not user input
                      dangerouslySetInnerHTML={{ __html: siteBanner }}
                    />
                  )}
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
                    </Routes>
                  </main>
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
