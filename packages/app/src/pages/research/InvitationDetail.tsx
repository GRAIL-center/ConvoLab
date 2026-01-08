import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTRPC } from '../../api/trpc';
import { MessageBubble } from '../../components/conversation/MessageBubble';

export function InvitationDetail() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const [showQR, setShowQR] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);

  // Close drawer on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotesDrawerOpen(false);
    };
    if (notesDrawerOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [notesDrawerOpen]);

  const trpc = useTRPC();
  const qc = useQueryClient();

  const {
    data: invitation,
    isLoading,
    error,
  } = useQuery({
    ...trpc.invitation.detail.queryOptions({ invitationId: invitationId! }),
    refetchInterval: (query) => {
      // Poll every 3 seconds until claimed, then every 10 seconds for updates
      const data = query.state.data;
      if (!data?.claimedAt) return 3000;
      if (data.activeSessionId) return 5000; // Active session - poll more frequently
      return 10000;
    },
    enabled: !!invitationId,
  });

  const addNoteMutation = useMutation({
    ...trpc.observation.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: trpc.invitation.detail.queryOptions({ invitationId: invitationId! }).queryKey,
      });
      setNoteContent('');
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-red-600">Failed to load invitation</div>
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/invite/${invitation.token}`;
  const isClaimed = !!invitation.claimedAt;
  const hasActiveSession = !!invitation.activeSessionId;
  const totalMessages = invitation.sessions.reduce((sum, s) => sum + s.messages.length, 0);

  // Build unified message timeline with session dividers
  const timeline: Array<
    | { type: 'divider'; sessionId: number; startedAt: Date; index: number }
    | {
        type: 'message';
        sessionId: number;
        message: {
          id: number;
          role: 'user' | 'partner' | 'coach';
          content: string;
          timestamp: string;
        };
      }
  > = [];

  invitation.sessions.forEach((session, idx) => {
    timeline.push({
      type: 'divider',
      sessionId: session.id,
      startedAt: new Date(session.startedAt),
      index: idx + 1,
    });
    session.messages.forEach((msg) => {
      timeline.push({ type: 'message', sessionId: session.id, message: msg });
    });
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/research/invitations" className="text-sm text-indigo-600 hover:underline">
              &larr; Back to Invitations
            </Link>
            <h1 className="mt-1 text-xl font-semibold text-gray-900">
              {invitation.label || `Invitation ${invitation.token.slice(0, 8)}...`}
            </h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
              {invitation.scenario ? (
                <span>{invitation.scenario.name}</span>
              ) : invitation.allowCustomScenario ? (
                <span className="italic">Custom scenario</span>
              ) : null}
              <span>{invitation.quota.label}</span>
              {isClaimed && (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Claimed
                </span>
              )}
            </div>
          </div>

          {/* Watch Live button */}
          {hasActiveSession && (
            <Link
              to={`/research/invitations/${invitationId}/observe`}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Watch Live
            </Link>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main content area */}
        <div className="flex min-h-0 flex-1 flex-col p-4 lg:p-6">
          {/* QR Code section */}
          {!isClaimed || showQR ? (
            <div className="mb-6 flex flex-shrink-0 flex-col items-center rounded-lg border border-gray-200 bg-white p-4 lg:p-6">
              <div className="mb-4 rounded-lg bg-white p-2 shadow-sm lg:p-4">
                <QRCodeSVG
                  value={inviteUrl}
                  size={180}
                  level="M"
                  className="lg:h-[200px] lg:w-[200px]"
                />
              </div>
              {!isClaimed ? (
                <p className="text-center text-sm text-gray-500">
                  Waiting for participant to scan...
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQR(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Hide QR code
                </button>
              )}
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(inviteUrl)}
                className="mt-2 text-sm text-indigo-600 hover:underline"
              >
                Copy link
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowQR(true)}
              className="mb-6 flex-shrink-0 text-sm text-indigo-600 hover:underline"
            >
              Show QR code
            </button>
          )}

          {/* Status section */}
          {isClaimed && (
            <div className="mb-6 flex-shrink-0 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {hasActiveSession ? (
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                        Session Active
                      </span>
                    ) : (
                      'Session Ended'
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    {invitation.sessions.length} session
                    {invitation.sessions.length !== 1 ? 's' : ''} &middot; {totalMessages} message
                    {totalMessages !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-sm text-gray-500 sm:text-right">
                  <div>
                    Quota: {invitation.quota.remaining.toLocaleString()} /{' '}
                    {invitation.quota.total.toLocaleString()} tokens
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Conversation timeline */}
          {timeline.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white">
              <div className="flex-shrink-0 border-b border-gray-200 px-4 py-3">
                <h2 className="font-medium text-gray-900">Conversation Timeline</h2>
              </div>
              <div className="flex-1 space-y-4 overflow-auto p-4">
                {timeline.map((item) => {
                  if (item.type === 'divider') {
                    return (
                      <div
                        key={`divider-${item.sessionId}`}
                        className="flex items-center gap-3 py-2"
                      >
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs text-gray-500">
                          Session {item.index} &middot; {item.startedAt.toLocaleDateString()}{' '}
                          {item.startedAt.toLocaleTimeString()}
                        </span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                    );
                  }
                  return (
                    <MessageBubble
                      key={`msg-${item.message.id}`}
                      message={{ ...item.message, isStreaming: false }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Notes sidebar - hidden on mobile */}
        <div className="hidden w-80 flex-shrink-0 border-l border-gray-200 bg-gray-50 lg:flex lg:flex-col">
          <div className="border-b border-gray-200 bg-white px-4 py-3">
            <h2 className="font-medium text-gray-900">Observation Notes</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <NotesPanel
              invitationId={invitationId!}
              notes={invitation.observationNotes}
              noteContent={noteContent}
              setNoteContent={setNoteContent}
              addNoteMutation={addNoteMutation}
            />
          </div>
        </div>
      </div>

      {/* Mobile Notes FAB */}
      <button
        type="button"
        onClick={() => setNotesDrawerOpen(true)}
        className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-indigo-600 py-3 pl-4 pr-5 text-white shadow-lg hover:bg-indigo-700 lg:hidden"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        <span className="font-medium">
          Notes{invitation.observationNotes.length > 0 && ` (${invitation.observationNotes.length})`}
        </span>
      </button>

      {/* Mobile Notes Drawer */}
      {notesDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setNotesDrawerOpen(false)}
            aria-label="Close notes drawer"
          />
          {/* Drawer */}
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-hidden rounded-t-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="font-semibold text-gray-900">Observation Notes</h2>
              <button
                type="button"
                onClick={() => setNotesDrawerOpen(false)}
                className="rounded-full p-1 hover:bg-gray-100"
                aria-label="Close"
              >
                <svg
                  className="h-6 w-6 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="max-h-[calc(80vh-56px)] overflow-auto">
              <NotesPanel
                invitationId={invitationId!}
                notes={invitation.observationNotes}
                noteContent={noteContent}
                setNoteContent={setNoteContent}
                addNoteMutation={addNoteMutation}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Extracted notes panel to reuse between desktop sidebar and mobile drawer
function NotesPanel({
  invitationId,
  notes,
  noteContent,
  setNoteContent,
  addNoteMutation,
}: {
  invitationId: string;
  notes: Array<{
    id: string;
    content: string;
    timestamp: string;
    researcher: { name: string | null };
  }>;
  noteContent: string;
  setNoteContent: (value: string) => void;
  addNoteMutation: {
    mutate: (data: { invitationId: string; content: string }) => void;
    isPending: boolean;
  };
}) {
  return (
    <>
      {/* Add note form */}
      <div className="border-b border-gray-200 bg-white p-4">
        <textarea
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          placeholder="Add observation note..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          rows={3}
        />
        <button
          type="button"
          onClick={() => {
            if (noteContent.trim()) {
              addNoteMutation.mutate({
                invitationId,
                content: noteContent.trim(),
              });
            }
          }}
          disabled={!noteContent.trim() || addNoteMutation.isPending}
          className="mt-2 w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-400"
        >
          {addNoteMutation.isPending ? 'Saving...' : 'Save Note'}
        </button>
      </div>

      {/* Notes list */}
      <div className="p-4">
        {notes.length === 0 ? (
          <p className="text-center text-sm text-gray-500">No notes yet</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-md bg-white p-3 shadow-sm">
                <p className="text-sm text-gray-900">{note.content}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {note.researcher.name ?? 'Unknown'} &middot;{' '}
                  {new Date(note.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
