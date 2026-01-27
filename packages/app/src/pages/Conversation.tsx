import { type ReactNode, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AsideButton } from '../components/conversation/AsideButton';
import { AsidePanel } from '../components/conversation/AsidePanel';
import { MessageInput } from '../components/conversation/MessageInput';
import { MessageList } from '../components/conversation/MessageList';
import { useConversationSocket } from '../hooks/useConversationSocket';

/** Full-screen centered message with optional title, message, and action button */
function FullScreenMessage({
  title,
  titleColor = 'text-gray-900',
  message,
  action,
}: {
  title?: string;
  titleColor?: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="text-center">
        {title && <h1 className={`text-2xl font-bold ${titleColor}`}>{title}</h1>}
        {message && <div className="mt-2 text-gray-600">{message}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function Conversation() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const parsedSessionId = sessionId ? parseInt(sessionId, 10) : NaN;

  if (Number.isNaN(parsedSessionId)) {
    return (
      <FullScreenMessage
        title="Invalid Session"
        titleColor="text-red-600"
        message="The session ID is not valid."
        action={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Go Home
          </button>
        }
      />
    );
  }

  return <ConversationContent sessionId={parsedSessionId} />;
}

function ConversationContent({ sessionId }: { sessionId: number }) {
  const navigate = useNavigate();
  const [asideOpen, setAsideOpen] = useState(false);
  const {
    status,
    scenario,
    messages,
    sendMessage,
    isStreaming,
    streamingRole,
    quota,
    error,
    // Aside state
    asideMessages,
    isAsideStreaming,
    asideError,
    startAside,
    cancelAside,
  } = useConversationSocket(sessionId);

  const handleLeave = () => {
    navigate('/');
  };

  const handleAsideOpen = () => {
    setAsideOpen(true);
  };

  const handleAsideClose = () => {
    setAsideOpen(false);
  };

  const handleAsideSend = (question: string) => {
    startAside(question);
  };

  // Loading state
  if (status === 'connecting' && !scenario) {
    return (
      <FullScreenMessage
        message={
          <output aria-live="polite">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <span className="sr-only">Loading</span>
            <p className="mt-4">Connecting...</p>
          </output>
        }
      />
    );
  }

  // Error state
  if (status === 'error' && error && !error.recoverable) {
    return (
      <FullScreenMessage
        title="Connection Error"
        titleColor="text-red-600"
        message={error.message}
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Refresh Page
          </button>
        }
      />
    );
  }

  const getStatusIndicator = () => {
    if (isStreaming) {
      if (streamingRole === 'partner') return 'Partner is typing...';
      if (streamingRole === 'coach') return 'Coach is thinking...';
      return 'Processing...'; // Fallback for transient state
    }
    if (status === 'connecting') {
      return 'Reconnecting...';
    }
    return null;
  };

  const statusText = getStatusIndicator();

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <header className="border-b bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {scenario?.name || 'Conversation'}
            </h1>
            {scenario?.partnerPersona && (
              <p className="text-sm text-gray-500">Talking with: {scenario.partnerPersona}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleLeave}
            className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Messages area */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <MessageList messages={messages} isStreaming={isStreaming} />

        {/* Status indicator */}
        {statusText && (
          <div className="px-4 py-2 text-center text-sm text-gray-500">{statusText}</div>
        )}

        {/* Quota warning */}
        {quota && !quota.exhausted && quota.remaining < quota.total * 0.2 && (
          <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-700">
            Low quota: {quota.remaining.toLocaleString()} / {quota.total.toLocaleString()} tokens
            remaining
          </div>
        )}

        {/* Quota exhausted */}
        {quota?.exhausted && (
          <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">
            Quota exhausted. You can no longer send messages.
          </div>
        )}

        {/* Recoverable error */}
        {error?.recoverable && (
          <div className="bg-red-50 px-4 py-2 text-center text-sm text-red-700">
            {error.message}
          </div>
        )}

        {/* Input with Ask Coach button */}
        <div className="relative">
          <MessageInput
            onSend={sendMessage}
            disabled={isStreaming || quota?.exhausted || false}
            placeholder={quota?.exhausted ? 'Quota exhausted' : undefined}
          />
          {/* Ask Coach button positioned above the input (Desktop) */}
          <div className="absolute right-4 -top-12 hidden md:block">
            <AsideButton
              onClick={handleAsideOpen}
              disabled={isStreaming || quota?.exhausted || false}
            />
          </div>

          {/* Mobile Ask Coach Slide-up Trigger */}
          <button
            type="button"
            onClick={handleAsideOpen}
            disabled={isStreaming || quota?.exhausted || false}
            className="absolute left-1/2 -top-10 -translate-x-1/2 flex items-center justify-center h-8 w-12 rounded-t-lg bg-amber-500 text-white shadow-lg md:hidden hover:bg-amber-600 disabled:bg-gray-300"
            aria-label="Ask Coach"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Quota bar at bottom */}
      {quota && (
        <div className="border-t bg-gray-50 px-4 py-2">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Token usage</span>
              <span>
                {(quota.total - quota.remaining).toLocaleString()} / {quota.total.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
              <div
                className={`h-1.5 rounded-full transition-all ${quota.exhausted
                    ? 'bg-red-500'
                    : quota.remaining < quota.total * 0.2
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                  }`}
                style={{
                  width: `${Math.min(100, ((quota.total - quota.remaining) / quota.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Aside Panel */}
      <AsidePanel
        isOpen={asideOpen}
        onClose={handleAsideClose}
        messages={asideMessages}
        isStreaming={isAsideStreaming}
        error={asideError}
        onSend={handleAsideSend}
        onCancel={cancelAside}
      />
    </div>
  );
}
