import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  const queryClient = useQueryClient();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: authData, isLoading: userLoading } = useQuery(trpc.auth.me.queryOptions());
  const { data: sessions, isLoading: sessionsLoading } = useQuery(
    trpc.session.listMine.queryOptions()
  );

  const deleteMutation = useMutation(
    trpc.session.delete.mutationOptions({
      onSuccess: () => {
        setConfirmDeleteId(null);
        queryClient.invalidateQueries(trpc.session.listMine.queryOptions());
      },
    })
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
          <div
            key={session.id}
            className="relative group rounded-2xl
                       bg-white dark:bg-[rgba(40,40,40,0.9)]
                       border border-[rgba(130,167,161,0.15)] dark:border-[rgba(212,232,229,0.08)]
                       hover:border-[rgba(130,167,161,0.4)] dark:hover:border-[rgba(212,232,229,0.2)]
                       hover:shadow-md shadow-sm transition-all"
          >
            {confirmDeleteId === session.id ? (
              <div className="p-4 flex flex-col gap-3">
                <p className="text-sm text-gray-700 dark:text-[#D4D4D4]">
                  Delete this conversation?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate({ sessionId: session.id })}
                    disabled={deleteMutation.isPending}
                    className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium
                               bg-red-500 hover:bg-red-600 text-white transition-colors
                               disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 rounded-lg px-3 py-1.5 text-xs font-medium
                               bg-gray-100 hover:bg-gray-200 dark:bg-[rgba(255,255,255,0.07)]
                               dark:hover:bg-[rgba(255,255,255,0.12)]
                               text-gray-700 dark:text-[#D4D4D4] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/conversation/${session.id}`)}
                  className="w-full text-left p-4"
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(session.id);
                  }}
                  aria-label="Delete conversation"
                  className="absolute top-2 right-2 p-1.5 rounded-lg
                             opacity-0 group-hover:opacity-100 transition-opacity
                             text-gray-400 hover:text-red-500 dark:text-[#6B6B6B]
                             dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-[rgba(239,68,68,0.1)]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                    <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clipRule="evenodd" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
