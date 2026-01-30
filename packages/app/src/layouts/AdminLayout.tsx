import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import { AdminSidebar } from '../components/AdminSidebar';
import { UserMenu } from '../components/UserMenu';

const siteBanner = import.meta.env.VITE_SITE_BANNER as string | undefined;

export function AdminLayout() {
  const trpc = useTRPC();
  const location = useLocation();
  const { data, isLoading } = useQuery(trpc.auth.me.queryOptions());

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-100">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Redirect non-admins to home
  if (!data?.user || data.user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-dvh flex-col bg-gray-100">
      {/* Site banner */}
      {siteBanner && (
        <div
          className="bg-amber-300 px-4 py-2 text-center text-sm font-medium text-black [&_a]:underline [&_a]:hover:text-amber-700"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: admin-controlled env var
          dangerouslySetInnerHTML={{ __html: siteBanner }}
        />
      )}

      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <a href="/" className="text-xl font-bold text-gray-900 hover:text-gray-700">
              ConvoLab Conversation Coach
            </a>
            <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
              Admin
            </span>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Main content with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <AdminSidebar currentPath={location.pathname} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
