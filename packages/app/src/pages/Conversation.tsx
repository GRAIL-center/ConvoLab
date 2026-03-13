import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import { MessageList } from '../components/conversation/MessageList';
import { useConversationSocket } from '../hooks/useConversationSocket';
import { ThemeToggle } from '../components/ThemeToggle';
import type { AsideMessage, Message } from '../hooks/useConversationSocket';

function FullScreenMessage({
  title,
  titleColor = 'text-gray-900 dark:text-[#EBEBEB]',
  message,
  action,
}: {
  title?: string;
  titleColor?: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#F5F5F4] dark:bg-[#1A1A1A]">
      <div className="text-center">
        {title && <h1 className={`text-2xl font-bold ${titleColor}`}>{title}</h1>}
        {message && <div className="mt-2 text-gray-500 dark:text-[#A0A0A0]">{message}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

/*
 * ── COACH PANEL MARKDOWN SIZE ───────────────────────────────────────────────
 * The [&_p] classes control coach insight text size.
 * Currently text-lg. Change to text-xl to go bigger, text-base to go smaller.
 */
const mdClasses = [
  '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_p]:leading-relaxed',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2',
  '[&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2',
  '[&_li]:my-1',
].join(' ');

// "Angry Uncle at Thanksgiving" → "Angry Uncle"
function getShortName(scenario: { name?: string; partnerPersona?: string } | null | undefined): string {
  if (!scenario) return 'Partner';
  if (scenario.name) {
    const beforeAt = scenario.name.split(/\s+at\s+/i)[0].trim();
    if (beforeAt) return beforeAt;
  }
  return scenario.partnerPersona?.split(' ').slice(0, 3).join(' ') ?? 'Partner';
}

// ── Coach insight card ────────────────────────────────────────────────────────
function CoachInsightCard({ message }: { message: Message | AsideMessage }) {
  const isAside = 'threadId' in message;
  const isUserAside = isAside && message.role === 'user';

  if (isUserAside) {
    return (
      <div className="flex justify-end">
        {/*
         * COACH PANEL USER QUESTION BUBBLE TEXT SIZE → text-base
         * Change to text-lg to go bigger
         */}
        <div className="max-w-[90%] rounded-xl rounded-tr-sm px-4 py-3
                        text-base text-gray-700 dark:text-[#EBEBEB]
                        bg-gray-100 border border-gray-200
                        dark:bg-[rgba(60,60,60,0.8)] dark:border-[rgba(212,232,229,0.1)]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4
                    bg-[rgba(134,199,194,0.12)] border border-[rgba(134,199,194,0.3)]
                    dark:bg-[rgba(134,199,194,0.1)] dark:border-[rgba(134,199,194,0.2)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-[rgba(50,130,120,0.9)] dark:text-[rgba(134,199,194,0.75)]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
               strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0
                 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12
                 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </div>
        {/*
         * COACH INSIGHT CARD TEXT SIZE → text-lg
         * Change to text-xl to go bigger, text-base to go smaller
         */}
        <div className={`flex-1 text-lg text-gray-800 dark:text-[#D4D4D4] ${mdClasses}`}>
          <Markdown>{message.content}</Markdown>
          {'isStreaming' in message && message.isStreaming && (
            <span className="ml-1 animate-pulse opacity-60 text-sm">▋</span>
          )}
        </div>
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
        titleColor="text-red-500 dark:text-[#FCA5A5]"
        message="The session ID is not valid."
        action={
          <button type="button" onClick={() => navigate('/')}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[rgba(40,90,80,1)] dark:text-[#EBEBEB]
                       hover:bg-[rgba(130,167,161,0.35)] transition-colors">
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
  const coachPanelRef = useRef<HTMLDivElement>(null);
  const [inputMode, setInputMode] = useState<'partner' | 'coach'>('partner');
  const [inputContent, setInputContent] = useState('');

  const {
    status, scenario, messages, sendMessage, isStreaming, streamingRole,
    quota, error, asideMessages, isAsideStreaming, asideError, startAside, cancelAside,
  } = useConversationSocket(sessionId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional scroll
  useEffect(() => {
    if (coachPanelRef.current) {
      coachPanelRef.current.scrollTop = coachPanelRef.current.scrollHeight;
    }
  }, [messages, asideMessages]);

  const handleSend = (e?: FormEvent) => {
    e?.preventDefault();
    const content = inputContent.trim();
    if (!content) return;
    if (inputMode === 'partner') sendMessage(content);
    else startAside(content);
    setInputContent('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const mainMessages = messages.filter(m => m.role !== 'coach');
  const coachMessages = messages.filter(m => m.role === 'coach');
  const totalCoachItems = coachMessages.length + asideMessages.length;
  const isInputDisabled =
    (inputMode === 'partner' && (isStreaming || quota?.exhausted === true)) ||
    (inputMode === 'coach' && isAsideStreaming);

  const shortName = getShortName(scenario);

  if (status === 'connecting' && !scenario) {
    return (
      <FullScreenMessage
        message={
          <output aria-live="polite">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2
                              border-[rgba(130,167,161,0.4)] border-t-[rgba(130,167,161,1)] animate-spin" />
              <p>Connecting...</p>
            </div>
          </output>
        }
      />
    );
  }

  if (status === 'error' && error && !error.recoverable) {
    return (
      <FullScreenMessage
        title="Connection Error" titleColor="text-red-500 dark:text-[#FCA5A5]"
        message={error.message}
        action={
          <button type="button" onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[rgba(40,90,80,1)] dark:text-[#EBEBEB]
                       hover:bg-[rgba(130,167,161,0.35)] transition-colors">
            Refresh Page
          </button>
        }
      />
    );
  }

  const statusText = (() => {
    if (isStreaming) {
      if (streamingRole === 'partner') return `${shortName} is typing...`;
      if (streamingRole === 'coach') return 'Coach is thinking...';
      return 'Processing...';
    }
    return status === 'connecting' ? 'Reconnecting...' : null;
  })();

  return (
    <div className="flex h-dvh flex-col bg-[#F0F0EE] dark:bg-[#141414]">

      {/*
        ── CONVERSATION HEADER HEIGHT ──────────────────────────────────────────
        py-3 = vertical padding. Try py-4/py-5 to make taller.
      */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 py-3
                         bg-white dark:bg-[#1C1C1C]
                         border-b border-gray-200 dark:border-[rgba(255,255,255,0.07)]">
        <button type="button" onClick={() => navigate('/')} aria-label="Leave conversation"
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
                     bg-gray-100 dark:bg-[rgba(255,255,255,0.07)]
                     text-gray-600 dark:text-[#A0A0A0]
                     hover:bg-gray-200 dark:hover:bg-[rgba(255,255,255,0.12)] transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
               strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>

        <div className="text-center min-w-0 mx-4 flex-1">
          {/* CONV HEADER TITLE SIZE → text-lg. Try text-xl to go bigger. */}
          <h1 className="text-lg font-semibold text-gray-900 dark:text-[#EBEBEB] truncate">
            {scenario?.name || 'Conversation'}
          </h1>
          {/* CONV HEADER SUBTITLE SIZE → text-sm. Try text-base to go bigger. */}
          {scenario?.partnerPersona && (
            <p className="text-sm text-gray-500 dark:text-[#707070] truncate">
              {scenario.partnerPersona}
            </p>
          )}
        </div>
        <ThemeToggle />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Chat ── */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">

          <MessageList
            messages={mainMessages}
            isStreaming={isStreaming && streamingRole === 'partner'}
            partnerName={shortName}
          />

          {/* STATUS TEXT SIZE → text-sm. Try text-base to go bigger. */}
          {statusText && (
            <div className="px-5 py-2 text-center text-sm text-gray-400 dark:text-[#555]">
              {statusText}
            </div>
          )}

          {quota && !quota.exhausted && quota.remaining < quota.total * 0.2 && (
            <div className="mx-4 mb-2 rounded-xl px-4 py-2.5 text-sm text-center
                            bg-[rgba(100,85,30,0.12)] dark:bg-[rgba(100,85,30,0.4)]
                            border border-[rgba(200,160,60,0.3)] dark:border-[rgba(200,160,60,0.5)]
                            text-[#8B7020] dark:text-[#E8D4A0]">
              Low quota: {quota.remaining.toLocaleString()} / {quota.total.toLocaleString()} tokens remaining
            </div>
          )}
          {quota?.exhausted && (
            <div className="mx-4 mb-2 rounded-xl px-4 py-2.5 text-sm text-center
                            bg-[rgba(100,40,40,0.12)] dark:bg-[rgba(100,40,40,0.4)]
                            border border-[rgba(200,80,80,0.3)] dark:border-[rgba(200,80,80,0.5)]
                            text-red-600 dark:text-[#FCA5A5]">
              Quota exhausted. You can no longer send messages.
            </div>
          )}
          {error?.recoverable && (
            <div className="mx-4 mb-2 rounded-xl px-4 py-2.5 text-sm text-center
                            bg-[rgba(100,40,40,0.12)] dark:bg-[rgba(100,40,40,0.4)]
                            border border-[rgba(200,80,80,0.3)] dark:border-[rgba(200,80,80,0.5)]
                            text-red-600 dark:text-[#FCA5A5]">
              {error.message}
            </div>
          )}

          <div className="h-px bg-gray-200 dark:bg-[rgba(255,255,255,0.07)]" />

          {/* ── Input area ── */}
          <div className="flex-shrink-0 px-5 pt-4 pb-5 bg-white dark:bg-[#1C1C1C]">

            {/*
              ── TAB TOGGLE BUTTONS ───────────────────────────────────────────
              py-2.5  = button height      (try py-3 to make taller)
              px-5    = button side padding
              text-base = button text size (try text-lg to go bigger)
            */}
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => setInputMode('partner')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-base font-medium
                            border transition-all ${
                  inputMode === 'partner'
                    ? 'bg-gray-800 dark:bg-[rgba(212,232,229,0.14)] text-white dark:text-[#E8E8E8] border-gray-700 dark:border-[rgba(212,232,229,0.2)]'
                    : 'bg-transparent text-gray-500 dark:text-[#666] border-gray-200 dark:border-[rgba(255,255,255,0.1)] hover:border-gray-300 dark:hover:border-[rgba(255,255,255,0.2)]'
                }`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
                     strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227
                       1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133
                       a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379
                       c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995
                       -2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513
                       C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                </svg>
                Reply to {shortName}
              </button>

              <button type="button" onClick={() => setInputMode('coach')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-base font-medium
                            border transition-all ${
                  inputMode === 'coach'
                    ? 'bg-[rgba(134,199,194,0.18)] dark:bg-[rgba(134,199,194,0.15)] text-[rgba(35,115,105,1)] dark:text-[rgba(134,199,194,0.9)] border-[rgba(134,199,194,0.5)] dark:border-[rgba(134,199,194,0.35)]'
                    : 'bg-transparent text-gray-500 dark:text-[#666] border-gray-200 dark:border-[rgba(255,255,255,0.1)] hover:border-gray-300 dark:hover:border-[rgba(255,255,255,0.2)]'
                }`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                     className="w-4 h-4">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                  <path d="M9 18h6"/><path d="M10 22h4"/>
                </svg>
                Ask the Coach
              </button>
            </div>

            {/*
              ── TEXT INPUT BOX ──────────────────────────────────────────────
              rows={2}   = number of visible lines (increase for taller box)
              py-3 px-4  = inner padding
              text-base  = input font size (try text-lg to go bigger)
            */}
            <form onSubmit={handleSend} className="flex gap-3 items-end">
              <textarea
                value={inputContent}
                onChange={(e) => setInputContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  inputMode === 'partner'
                    ? `Type your response to ${shortName}...`
                    : 'Ask the coach a question...'
                }
                disabled={isInputDisabled}
                rows={2}
                aria-label="Message input"
                className="flex-1 resize-none rounded-2xl px-4 py-3 text-base
                           bg-gray-50 dark:bg-[rgba(38,38,38,0.95)]
                           border border-gray-200 dark:border-[rgba(255,255,255,0.09)]
                           text-gray-900 dark:text-[#EBEBEB]
                           placeholder-gray-400 dark:placeholder-[#4A4A4A]
                           focus:outline-none
                           focus:border-[rgba(130,167,161,0.55)] dark:focus:border-[rgba(212,232,229,0.28)]
                           focus:ring-2 focus:ring-[rgba(130,167,161,0.12)] dark:focus:ring-[rgba(212,232,229,0.07)]
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              />

              <div className="flex-shrink-0 self-end">
                {inputMode === 'coach' && isAsideStreaming ? (
                  <button type="button" onClick={cancelAside}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-base font-medium
                               bg-[rgba(100,40,40,0.25)] border border-[rgba(200,80,80,0.4)]
                               text-red-500 dark:text-[#FCA5A5]
                               hover:bg-[rgba(120,50,50,0.35)] transition-colors">
                    Cancel
                  </button>
                ) : (
                  <button type="submit"
                    disabled={isInputDisabled || !inputContent.trim()}
                    aria-label="Send"
                    className="flex items-center gap-2 px-5 py-3 rounded-xl text-base font-medium
                               bg-gray-800 dark:bg-[rgba(212,232,229,0.16)]
                               text-white dark:text-[#EBEBEB]
                               hover:bg-gray-700 dark:hover:bg-[rgba(212,232,229,0.24)]
                               disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                         className="w-4 h-4 -rotate-45 translate-x-px -translate-y-px">
                      <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1
                               0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0
                               18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                    Send
                  </button>
                )}
              </div>
            </form>

            {/* HINT TEXT SIZE → text-sm. Try text-base to go bigger. */}
            <p className="mt-2 text-sm text-gray-400 dark:text-[#444]">
              Press Enter to send • Shift+Enter for new line
            </p>
          </div>
        </div>

        {/*
          ── COACH INSIGHTS PANEL ─────────────────────────────────────────────
          w-1/4 = coach panel takes exactly 1/4 of the screen width.
          To make it wider: try w-1/3 (33%) or w-2/5 (40%).
          To make it narrower: try w-1/5 (20%).
        */}
        <div className="hidden md:flex w-1/4 flex-col flex-shrink-0
                        bg-white dark:bg-[#1C1C1C]
                        border-l border-gray-200 dark:border-[rgba(255,255,255,0.07)]">

          {/*
            ── COACH PANEL HEADER PADDING ─────────────────────────────────────
            px-5 py-5 = padding. Increase py to make it taller.
          */}
          <div className="flex-shrink-0 px-5 py-5
                          border-b border-gray-100 dark:border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0
                              bg-[rgba(134,199,194,0.18)] border border-[rgba(134,199,194,0.4)]
                              dark:bg-[rgba(134,199,194,0.14)] dark:border-[rgba(134,199,194,0.28)]">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                     className="h-5 w-5 text-[rgba(45,125,115,1)] dark:text-[rgba(134,199,194,0.85)]">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                  <path d="M9 18h6"/><path d="M10 22h4"/>
                </svg>
              </div>
              <div>
                {/* COACH PANEL HEADER TITLE SIZE → text-lg. Try text-xl to go bigger. */}
                <h2 className="text-lg font-semibold text-gray-900 dark:text-[#EBEBEB]">
                  Coach Insights
                </h2>
                {/* COACH PANEL HEADER SUBTITLE SIZE → text-sm. Try text-base to go bigger. */}
                <p className="text-sm text-gray-500 dark:text-[#666]">
                  Real-time feedback & guidance
                </p>
              </div>
            </div>
          </div>

          {/* Cards feed */}
          <div ref={coachPanelRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {totalCoachItems === 0 && !isAsideStreaming ? (
              <div className="flex flex-col items-center justify-center h-32 text-center px-2">
                {/* EMPTY STATE TEXT SIZE → text-base. Try text-lg to go bigger. */}
                <p className="text-base text-gray-400 dark:text-[#4A4A4A]">
                  Coaching insights will appear here as you practice.
                </p>
              </div>
            ) : (
              <>
                {coachMessages.map((msg, i) => (
                  <CoachInsightCard key={msg.id !== -1 ? msg.id : `coach-${i}`} message={msg} />
                ))}
                {asideMessages.length > 0 && (
                  <>
                    {coachMessages.length > 0 && (
                      <div className="flex items-center gap-2 py-1">
                        <div className="h-px flex-1 bg-gray-100 dark:bg-[rgba(255,255,255,0.06)]" />
                        <span className="text-sm text-gray-400 dark:text-[#4A4A4A]">Your questions</span>
                        <div className="h-px flex-1 bg-gray-100 dark:bg-[rgba(255,255,255,0.06)]" />
                      </div>
                    )}
                    {asideMessages.map((msg, i) => (
                      <CoachInsightCard key={msg.id !== -1 ? msg.id : `aside-${i}`} message={msg} />
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {asideError && (
            <div className="flex-shrink-0 mx-4 mb-3 rounded-xl px-4 py-3 text-sm
                            bg-[rgba(100,40,40,0.12)] dark:bg-[rgba(100,40,40,0.3)]
                            border border-[rgba(200,80,80,0.3)] text-red-600 dark:text-[#FCA5A5]">
              {asideError.message}
            </div>
          )}

          {quota && (
            <div className="flex-shrink-0 px-5 py-4
                            border-t border-gray-100 dark:border-[rgba(255,255,255,0.06)]">
              {/* TOKEN BAR LABEL SIZE → text-sm. Try text-base to go bigger. */}
              <div className="flex items-center justify-between text-sm
                              text-gray-400 dark:text-[#4A4A4A] mb-2">
                <span>Token usage</span>
                <span>{(quota.total - quota.remaining).toLocaleString()} / {quota.total.toLocaleString()}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-[rgba(255,255,255,0.07)]">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    quota.exhausted ? 'bg-red-400 dark:bg-[rgba(200,80,80,0.7)]'
                    : quota.remaining < quota.total * 0.2 ? 'bg-amber-400 dark:bg-[rgba(200,160,60,0.7)]'
                    : 'bg-[rgba(100,180,170,0.8)] dark:bg-[rgba(134,199,194,0.6)]'
                  }`}
                  style={{ width: `${Math.min(100, ((quota.total - quota.remaining) / quota.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}