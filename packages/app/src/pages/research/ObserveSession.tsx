import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTRPC } from '../../api/trpc';
import { MessageBubble } from '../../components/conversation/MessageBubble';
import { useObserverSocket } from '../../hooks/useObserverSocket';

export function ObserveSession() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const [noteContent, setNoteContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const trpc = useTRPC();
  const qc = useQueryClient();

  // Fetch invitation to get the active session ID
  const { data: invitation, isLoading: loadingInvitation } = useQuery({
    ...trpc.invitation.detail.queryOptions({ invitationId: invitationId! }),
    enabled: !!invitationId,
    refetchInterval: 10000, // Keep polling for updates
  });

  const activeSessionId = invitation?.activeSessionId;

  // Connect to observer WebSocket if we have an active session
  const { status, scenario, messages, isStreaming, streamingRole, error } = useObserverSocket(
    activeSessionId ?? 0
  );

  // Auto-scroll to bottom when messages change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional scroll on message count change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const addNoteMutation = useMutation({
    ...trpc.observation.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.invitation.detail.queryOptions({ invitationId: invitationId! }).queryKey,
      });
      setNoteContent('');
    },
  });

  if (loadingInvitation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-red-600">Invitation not found</div>
      </div>
    );
  }

  if (!activeSessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="text-gray-500">No active session</div>
        <Link
          to={`/research/invitations/${invitationId}`}
          className="mt-4 text-indigo-600 hover:underline"
        >
          &larr; Back to invitation
        </Link>
      </div>
    );
  }

  const scenarioName = scenario?.name ?? invitation.scenario?.name ?? 'Custom Scenario';
  const partnerPersona = scenario?.partnerPersona ?? invitation.scenario?.partnerPersona ?? '';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to={`/research/invitations/${invitationId}`}
              className="text-sm text-indigo-600 hover:underline"
            >
              &larr; Back to invitation
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">Observing: {scenarioName}</h1>
            {partnerPersona && <p className="text-sm text-gray-500">{partnerPersona}</p>}
          </div>

          <div className="flex items-center gap-3">
            {/* Status indicator */}
            {status === 'connected' && (
              <span className="flex items-center gap-2 text-sm text-green-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Live
              </span>
            )}
            {status === 'connecting' && (
              <span className="text-sm text-amber-600">Connecting...</span>
            )}
            {status === 'error' && <span className="text-sm text-red-600">Disconnected</span>}

            {/* Streaming indicator */}
            {isStreaming && streamingRole && (
              <span className="text-sm text-gray-500">
                {streamingRole === 'partner' ? 'Partner' : 'Coach'} responding...
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex flex-1 flex-col">
          {error && (
            <div className="m-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error.message}
            </div>
          )}

          <div className="flex-1 overflow-auto p-4">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500">Waiting for messages...</div>
              ) : (
                messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Notes sidebar */}
        <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-gray-50">
          <div className="border-b border-gray-200 bg-white px-4 py-3">
            <h2 className="font-medium text-gray-900">Notes</h2>
          </div>

          {/* Quick note form */}
          <div className="border-b border-gray-200 bg-white p-3">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Quick observation..."
              aria-label="Quick observation note"
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={2}
            />
            <button
              type="button"
              onClick={() => {
                if (noteContent.trim()) {
                  addNoteMutation.mutate({
                    invitationId: invitationId!,
                    sessionId: activeSessionId,
                    content: noteContent.trim(),
                  });
                }
              }}
              disabled={!noteContent.trim() || addNoteMutation.isPending}
              className="mt-2 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {addNoteMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>

          {/* Notes list */}
          <div className="overflow-auto p-3">
            {invitation.observationNotes.length === 0 ? (
              <p className="text-center text-sm text-gray-500">No notes yet</p>
            ) : (
              <div className="space-y-2">
                {invitation.observationNotes.map((note) => (
                  <div key={note.id} className="rounded-md bg-white p-2 text-sm shadow-sm">
                    <p className="text-gray-900">{note.content}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(note.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
