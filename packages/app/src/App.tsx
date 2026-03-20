import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AppRouter } from './api/trpc';
import { TRPCProvider } from './api/trpc';
import { UserMenu } from './components/UserMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { AdminLayout } from './layouts/AdminLayout';
import { ResearchLayout } from './layouts/ResearchLayout';
import { Telemetry } from './pages/admin/Telemetry';
import { UserDetail } from './pages/admin/UserDetail';
import { UserList } from './pages/admin/UserList';
import { Conversation } from './pages//Conversation';
import { Home } from './pages/Home';
import { Invite } from './pages/Invite';
import { InvitationDetail } from './pages/research/InvitationDetail';
import { InvitationList } from './pages/research/InvitationList';
import { ObserveSession } from './pages/research/ObserveSession';


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
              <Route path="invitations/:invitationId" element={<InvitationDetail />} />
              <Route path="invitations/:invitationId/observe" element={<ObserveSession />} />
            </Route>

            {/* Standard layout with header */}
            <Route
              path="*"
              element={
                <div className="min-h-screen bg-[#F5F5F4] dark:bg-[#1A1A1A]">
                  {siteBanner && (
                    <div
                      className="bg-amber-300 px-4 py-2 text-center text-sm font-medium text-black [&_a]:underline [&_a]:hover:text-amber-700"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: Admin-controlled content only
                      dangerouslySetInnerHTML={{ __html: siteBanner }}
                    />
                  )}
                  <header className="bg-white/95 dark:bg-[rgba(30,30,30,0.95)] backdrop-blur-sm
                                     border-b border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.08)]
                                     sticky top-0 z-10">
                    {/*
                      ── HEADER HEIGHT ──────────────────────────────
                      py-4 = top/bottom padding → increase to py-5/py-6 to make taller
                      px-10/px-16 = side padding
                    */}
                    <div className="flex items-center justify-between px-8 py-4 sm:px-10 lg:px-16">
                      <div>
                        {/* HEADER TITLE SIZE → currently text-2xl, try text-3xl to go bigger */}
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-[#EBEBEB]">
                          Conversation Coach
                        </h1>
                        {/* HEADER SUBTITLE SIZE → currently text-sm, try text-base to go bigger */}
                        <p className="text-sm text-gray-500 dark:text-[#A0A0A0] mt-0.5">
                          Practice difficult conversations with AI guidance
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <UserMenu />
                      </div>
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