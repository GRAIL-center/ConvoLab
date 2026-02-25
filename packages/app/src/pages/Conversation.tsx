import { type ReactNode, useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageInput } from '../components/conversation/MessageInput';
import { MessageList } from '../components/conversation/MessageList';
import { useConversationSocket } from '../hooks/useConversationSocket';
import { MobileMessageInput } from '../components/conversation/MobileMessageInput';
import { ThemeToggle } from '../components/ThemeToggle';
import Markdown from 'react-markdown';


/** Full-screen centered message with optional title, message, and action button */
function FullScreenMessage({
  title,
  titleColor = 'text-gray-900 dark:text-white',
  message,
  action,
}: {
  title?: string;
  titleColor?: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        {title && <h1 className={`text-2xl font-bold ${titleColor}`}>{title}</h1>}
        {message && <div className="mt-2 text-gray-600 dark:text-gray-400 text-xl">{message}</div>}
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
        titleColor="text-red-600 dark:text-red-400"
        message="The session ID is not valid."
        action={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Go Home
          </button>
        }
      />
    );
  }

  return <ConversationContent sessionId={parsedSessionId} />;
}

// Markdown styling for coach messages - matches main conversation
const markdownClasses = `
  [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_p]:text-lg [&_p]:leading-relaxed
  [&_strong]:font-semibold
  [&_em]:italic
  [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-3 [&_ul]:text-lg
  [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-3 [&_ol]:text-lg
  [&_li]:my-2 [&_li]:text-lg
  [&_code]:bg-black/10 dark:bg-white/10 [&_code]:px-1.5 [&_code]:rounded [&_code]:text-base
  [&_pre]:bg-black/10 dark:bg-white/10 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-3 [&_pre]:text-base
  [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-3 [&_blockquote]:text-lg
  [&_hr]:my-4 [&_hr]:border-current [&_hr]:opacity-30
`.trim();

function ConversationContent({ sessionId }: { sessionId: number }) {
  const navigate = useNavigate();
  const coachMessagesEndRef = useRef<HTMLDivElement>(null);
  const coachInputRef = useRef<HTMLTextAreaElement>(null);

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

  // Auto-scroll coach messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: asideMessages triggers scroll
  useEffect(() => {
    if (coachMessagesEndRef.current) {
      coachMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [asideMessages]);

  // Loading state
  if (status === 'connecting' && !scenario) {
    return (
      <FullScreenMessage
        message={
          <output aria-live="polite">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 dark:border-blue-400 border-t-transparent" />
            <span className="sr-only">Loading</span>
            <p className="mt-4 text-gray-900 dark:text-white">Connecting...</p>
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
        titleColor="text-red-600 dark:text-red-400"
        message={error.message}
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
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
      return 'Processing...';
    }
    if (status === 'connecting') {
      return 'Reconnecting...';
    }
    return null;
  };

  const statusText = getStatusIndicator();

  // Filter out aside messages from the main conversation view
  const mainMessages = messages.filter(m => !('asideThreadId' in m));

  const handleCoachSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (coachInputRef.current?.value.trim() && !isAsideStreaming) {
      startAside(coachInputRef.current.value.trim());
      coachInputRef.current.value = '';
    }
  };

  const handleCoachKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCoachSubmit(e);
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              {scenario?.name || 'Conversation'}
            </h1>
            {scenario?.partnerPersona && (
              <p className="text-base text-gray-500 dark:text-gray-400">Talking with: {scenario.partnerPersona}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLeave}
              className="rounded border border-gray-300 dark:border-gray-600 px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Leave
            </button>
          </div>
        </div>
      </header>

      {/* SPLIT SCREEN LAYOUT - Centered with small gap */}
      <div className="flex-1 flex overflow-hidden justify-center px-8 gap-3">
        
        {/* LEFT SIDE: Main Conversation */}
        <div className="flex w-full max-w-4xl flex-col">
          <div className="flex w-full flex-1 flex-col overflow-hidden">
            
            {/* Main conversation messages */}
            <MessageList
              messages={mainMessages}
              isStreaming={isStreaming}
            />

            {/* Status indicator */}
            {statusText && (
              <div className="px-4 py-2 text-center text-base text-gray-500 dark:text-gray-400">{statusText}</div>
            )}

            {/* Quota warning */}
            {quota && !quota.exhausted && quota.remaining < quota.total * 0.2 && (
              <div className="bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-center text-base text-amber-700 dark:text-amber-300">
                Low quota: {quota.remaining.toLocaleString()} / {quota.total.toLocaleString()} tokens remaining
              </div>
            )}

            {/* Quota exhausted */}
            {quota?.exhausted && (
              <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 text-center text-base text-red-700 dark:text-red-300">
                Quota exhausted. You can no longer send messages.
              </div>
            )}

            {/* Recoverable error */}
            {error?.recoverable && (
              <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2 text-center text-base text-red-700 dark:text-red-300">
                {error.message}
              </div>
            )}

            {/* Desktop Input */}
            <div className="hidden md:block">
              <MessageInput
                onSend={sendMessage}
                disabled={isStreaming || quota?.exhausted || false}
                placeholder={quota?.exhausted ? 'Quota exhausted' : 'Type your message...'}
              />
            </div>

            {/* Mobile Input */}
            <div className="md:hidden">
              <MobileMessageInput
                onSendPartner={sendMessage}
                onSendCoach={startAside}
                partnerName={scenario?.partnerPersona || 'Partner'}
                disabled={isStreaming || isAsideStreaming || quota?.exhausted || false}
                isInsightsOpen={false}
                onToggleInsights={() => {}}
                onInputFocus={() => {}}
                onInputBlur={() => {}}
              />
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Coach Panel - Shadow only, no borders */}
        <div className="hidden md:flex md:w-[32rem] lg:w-[36rem] flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          
          {/* Coach header */}
          <div className="border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 px-5 py-4">
            <h2 className="text-xl font-semibold text-yellow-900 dark:text-yellow-200 flex items-center gap-2">
              💡 Coach
            </h2>
            <p className="text-base text-yellow-800 dark:text-yellow-300 mt-1">
              Ask for advice anytime
            </p>
          </div>

          {/* Coach messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {asideMessages.length === 0 && !isAsideStreaming ? (
              <div className="text-center text-gray-500 dark:text-gray-400 text-base py-8">
                <p className="mb-2 text-lg">👋 Hi! I'm your conversation coach.</p>
                <p className="text-base">
                  I can see your full conversation and provide guidance. Ask me anything!
                </p>
              </div>
            ) : (
              asideMessages.map((msg, i) => (
                <div key={msg.id !== -1 ? msg.id : `streaming-${i}`}>
                  {msg.role === 'user' ? (
                    // User message - matches main conversation style
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl px-6 py-4 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-lg">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    // Coach message - matches YELLOW coach messages from main conversation
                    <div className="flex justify-start">
                      <div className={`max-w-[85%] rounded-2xl px-6 py-4 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100 border border-yellow-200 dark:border-yellow-700 ${markdownClasses}`}>
                        <Markdown>{msg.content}</Markdown>
                        {msg.isStreaming && <span className="ml-1 animate-pulse text-lg">|</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={coachMessagesEndRef} />
          </div>

          {/* Coach error */}
          {asideError && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm border-t border-red-200 dark:border-red-800">
              {asideError.message}
            </div>
          )}

          {/* Coach input */}
          <form 
            onSubmit={handleCoachSubmit}
            className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <div className="flex gap-3 items-end">
              <textarea
                ref={coachInputRef}
                placeholder="Ask the coach a question..."
                disabled={isAsideStreaming}
                rows={1}
                onKeyDown={handleCoachKeyDown}
                className="flex-1 resize-none rounded-3xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 px-5 py-3 text-lg focus:border-yellow-500 dark:focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:focus:ring-yellow-400 disabled:bg-gray-100 dark:disabled:bg-gray-800"
              />
              {isAsideStreaming ? (
                <button
                  type="button"
                  onClick={cancelAside}
                  className="rounded-2xl bg-red-500 dark:bg-red-600 px-6 py-3 text-white hover:bg-red-600 dark:hover:bg-red-700 text-base font-medium"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!coachInputRef.current?.value.trim()}
                  className="rounded-2xl bg-yellow-500 dark:bg-yellow-600 px-6 py-3 text-white hover:bg-yellow-600 dark:hover:bg-yellow-700 text-base font-medium disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                >
                  Ask
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Quota bar at bottom - full width */}
      {quota && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 hidden md:block">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Token usage</span>
              <span>
                {(quota.total - quota.remaining).toLocaleString()} / {quota.total.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  quota.exhausted
                    ? 'bg-red-500 dark:bg-red-400'
                    : quota.remaining < quota.total * 0.2
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : 'bg-blue-500 dark:bg-blue-400'
                }`}
                style={{
                  width: `${Math.min(100, ((quota.total - quota.remaining) / quota.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}