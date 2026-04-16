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

function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

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

  if (!isLoading && !authData?.user) {
    return (
      <div
        className="mb-8 rounded-2xl p-6
                      bg-white dark:bg-[rgba(40,40,40,0.9)]
                      border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]"
      >
        <h2 className="text-base font-medium text-gray-900 dark:text-[#EBEBEB] mb-2">Welcome</h2>
        <p className="text-gray-500 dark:text-[#A0A0A0]">
          Sign in or use an invitation link to start practicing conversations.
        </p>
      </div>
    );
  }

  if (isLoading || !sessions || !Array.isArray(sessions) || sessions.length === 0) {
    // Show empty state when not loading and authenticated but no sessions
    if (
      !isLoading &&
      authData?.user &&
      (!sessions || (sessions as unknown as Session[]).length === 0)
    ) {
      return (
        <div className="mb-8">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[#EBEBEB] mb-4">
            Your Conversations
          </h2>
          <div
            className="rounded-2xl p-6 text-center
                          bg-white dark:bg-[rgba(40,40,40,0.9)]
                          border border-[rgba(130,167,161,0.15)] dark:border-[rgba(212,232,229,0.08)]"
          >
            <p className="text-gray-400 dark:text-[#6B6B6B]">
              No conversations yet. Start one below!
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-gray-900 dark:text-[#EBEBEB] mb-4">
        Your Conversations
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(sessions as Session[]).map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => navigate(`/conversation/${session.id}`)}
            className="text-left rounded-2xl p-4 transition-all
                       bg-white dark:bg-[rgba(40,40,40,0.9)]
                       border border-[rgba(130,167,161,0.15)] dark:border-[rgba(212,232,229,0.08)]
                       hover:border-[rgba(130,167,161,0.4)] dark:hover:border-[rgba(212,232,229,0.2)]
                       hover:shadow-md shadow-sm"
          >
            <div className="font-medium text-gray-900 dark:text-[#EBEBEB] text-sm">
              {session.scenario?.name || 'Conversation'}
            </div>
            {session.scenario?.partnerPersona && (
              <div className="text-xs text-gray-500 dark:text-[#A0A0A0] mt-0.5">
                with {session.scenario.partnerPersona}
              </div>
            )}
            <div className="flex items-center justify-between mt-3 text-xs text-gray-400 dark:text-[#6B6B6B]">
              <span>{session.messageCount} messages</span>
              <span>{formatRelativeTime(session.startedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
