import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTRPC } from '../api/trpc';

interface Session {
  id: number;
  startedAt: string | Date;
  messageCount: number;
  scenario?: {
    name: string;
    partnerPersona?: string;
  };
}

/** Format a date as a relative time string (e.g., "5m ago", "2d ago") */
function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // Handle future dates gracefully (e.g., server time skew)
  if (diffMs < 0) return d.toLocaleDateString();

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export function YourSessions() {
  const trpc = useTRPC();
  const navigate = useNavigate();

  const { data: authData, isLoading: userLoading } = useQuery(trpc.auth.me.queryOptions());
  const { data: sessions, isLoading: sessionsLoading } = useQuery(
    trpc.session.listMine.queryOptions()
  );

  const isLoading = userLoading || sessionsLoading;

  // Show welcome message for unauthenticated users
  if (!isLoading && !authData?.user) {
    return (
      <div className="mb-8 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Welcome</h2>
        <p className="text-gray-600 dark:text-gray-300">
          Sign in or use an invitation link to start practicing conversations.
        </p>
      </div>
    );
  }

  // Don't render anything if loading or no sessions
  if (isLoading || !sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Your Conversations</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(sessions as Session[]).map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => navigate(`/conversation/${session.id}`)}
            className="text-left rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
          >
            <div className="font-medium text-gray-900 dark:text-white">
              {session.scenario?.name || 'Conversation'}
            </div>
            {session.scenario?.partnerPersona && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                with {session.scenario.partnerPersona}
              </div>
            )}
            <div className="flex items-center justify-between mt-3 text-xs text-gray-400 dark:text-gray-500">
              <span>{session.messageCount} messages</span>
              <span>{formatRelativeTime(session.startedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}