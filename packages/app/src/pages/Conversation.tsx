import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageList } from '../components/conversation/MessageList';
import { MobileMessageInput } from '../components/conversation/MobileMessageInput';
import { DesktopCoachPanel } from '../components/conversation/DesktopCoachPanel';
import { useConversationSocket } from '../hooks/useConversationSocket';
import { ThemeToggle } from '../components/ThemeToggle';
import type { AsideMessage, Message } from '../hooks/useConversationSocket';

// Inline SVG Icons
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);

const MessageSquareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
  </svg>
);

const LightbulbIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
  </svg>
);

function FullScreenMessage({
  title,
  titleColor = 'text-[#1A1A1A] dark:text-[#EBEBEB]',
  message,
  action,
}: {
  title?: string;
  titleColor?: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#F8F8F8] dark:bg-[#1A1A1A]">
      <div className="text-center">
        {title && <h1 className={`text-2xl font-bold ${titleColor}`}>{title}</h1>}
        {message && <div className="mt-2 text-[#6B6B6B] dark:text-[#A0A0A0]">{message}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

// Extract short name from scenario
// "Angry Uncle at Thanksgiving" → "Angry Uncle"
// "Difficult Coworker Feedback" → "Difficult Coworker"
function getShortName(scenario: { name?: string; partnerPersona?: string } | null | undefined): string {
  if (!scenario?.name) return 'Partner';
  
  // Split on " at " and take first part
  const beforeAt = scenario.name.split(/\s+at\s+/i)[0].trim();
  if (beforeAt && beforeAt !== scenario.name) {
    return beforeAt; // "Angry Uncle at Thanksgiving" → "Angry Uncle"
  }
  
  // For names without " at ", take first 2-3 words
  // "Difficult Coworker Feedback" → "Difficult Coworker"
  const words = scenario.name.split(/\s+/);
  if (words.length > 2 && (words[words.length - 1].toLowerCase() === 'feedback' || 
                           words[words.length - 1].toLowerCase() === 'conversation' ||
                           words[words.length - 1].toLowerCase() === 'discussion')) {
    return words.slice(0, -1).join(' ');
  }
  
  return scenario.name;
}

export function Conversation() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const parsedSessionId = sessionId ? parseInt(sessionId, 10) : NaN;

  if (Number.isNaN(parsedSessionId)) {
    return (
      <FullScreenMessage
        title="Invalid Session"
        titleColor="text-[#991B1B] dark:text-[#FCA5A5]"
        message="The session ID is not valid."
        action={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(212,232,229,0.6)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[#1A1A1A] dark:text-[#EBEBEB]
                       hover:bg-[rgba(212,232,229,0.8)] transition-colors"
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputMode, setInputMode] = useState<'partner' | 'coach'>('partner');

  const {
    status,
    scenario,
    messages,
    sendMessage,
    isStreaming,
    quota,
    error,
    asideMessages,
    isAsideStreaming,
    startAside,
  } = useConversationSocket(sessionId);

  // Auto-scroll main messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputRef.current?.value.trim()) return;
    
    const content = inputRef.current.value.trim();
    if (inputMode === 'partner') {
      sendMessage(content);
    } else {
      startAside(content);
    }
    inputRef.current.value = '';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const mainMessages = messages.filter(m => m.role !== 'coach');
  const coachMessages = messages.filter(m => m.role === 'coach');
  const shortName = getShortName(scenario);
  
  const isInputDisabled = 
    (inputMode === 'partner' && (isStreaming || quota?.exhausted)) ||
    (inputMode === 'coach' && isAsideStreaming);

  // Loading state
  if (status === 'connecting' && !scenario) {
    return (
      <FullScreenMessage
        message={
          <output aria-live="polite">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2
                              border-[rgba(212,232,229,0.6)] border-t-[rgba(212,232,229,0.8)] animate-spin" />
              <p>Connecting...</p>
            </div>
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
        titleColor="text-[#991B1B] dark:text-[#FCA5A5]"
        message={error.message}
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(212,232,229,0.6)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[#1A1A1A] dark:text-[#EBEBEB]
                       hover:bg-[rgba(212,232,229,0.8)] transition-colors"
          >
            Refresh Page
          </button>
        }
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[#F8F8F8] dark:bg-[#1A1A1A]">
      {/* Header - EXACT FIGMA */}
      <header className="flex items-center justify-between px-4 py-3 backdrop-blur-sm
                         bg-[rgba(255,255,255,0.9)] dark:bg-[rgba(30,30,30,0.95)]
                         border-b border-[rgba(200,220,210,0.5)] dark:border-[rgba(255,255,255,0.07)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-full transition-colors
                       text-[#1A1A1A] dark:text-[#EBEBEB]
                       hover:bg-[rgba(212,232,229,0.4)]"
            type="button"
            aria-label="Go back"
          >
            <ArrowLeftIcon />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-[#1A1A1A] dark:text-[#EBEBEB]">
              {scenario?.name || 'Conversation'}
            </h1>
            {scenario?.partnerPersona && (
              <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
                {scenario.partnerPersona}
              </p>
            )}
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* Main content - TWO COLUMN LAYOUT (desktop) */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Main conversation */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <div className="mx-auto max-w-4xl">
              <MessageList 
                messages={mainMessages} 
                partnerName={shortName}
                isStreaming={isStreaming}
              />
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* DESKTOP Input area - SINGLE INPUT - EXACT FIGMA */}
          <div className="hidden md:block px-6 py-4
                          bg-[rgba(255,255,255,0.9)] dark:bg-[rgba(30,30,30,0.95)]
                          border-t border-[rgba(200,220,210,0.5)] dark:border-[rgba(255,255,255,0.07)]">
            <div className="mx-auto max-w-4xl space-y-3">
              {/* Mode selection buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('partner');
                    inputRef.current?.focus();
                  }}
                  disabled={isStreaming || quota?.exhausted}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium transition-all
                    ${inputMode === 'partner'
                      ? 'bg-[rgba(212,232,229,0.6)] text-[#1A1A1A] dark:text-[#EBEBEB] hover:bg-[rgba(212,232,229,0.8)]'
                      : 'bg-[rgba(240,240,240,1)] dark:bg-[rgba(40,40,40,0.5)] text-[#6B6B6B] dark:text-[#A0A0A0] hover:bg-[rgba(230,230,230,1)] dark:hover:bg-[rgba(40,40,40,0.7)]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <MessageSquareIcon />
                  Reply to {shortName}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInputMode('coach');
                    inputRef.current?.focus();
                  }}
                  disabled={isAsideStreaming}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium transition-all border
                    ${inputMode === 'coach'
                      ? 'bg-[rgba(134,199,194,0.3)] border-[rgba(100,180,175,0.8)] text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.9)] hover:bg-[rgba(134,199,194,0.5)]'
                      : 'bg-[rgba(240,240,240,1)] dark:bg-[rgba(40,40,40,0.5)] border-[rgba(200,220,210,0.6)] dark:border-[rgba(255,255,255,0.1)] text-[#6B6B6B] dark:text-[#A0A0A0] hover:bg-[rgba(230,230,230,1)] dark:hover:bg-[rgba(40,40,40,0.7)]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <LightbulbIcon />
                  Ask the Coach
                </button>
              </div>

              {/* SINGLE input that changes based on mode - EXACT FIGMA */}
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  onKeyDown={handleKeyDown}
                  placeholder={inputMode === 'partner' 
                    ? `Type your response to ${shortName}...`
                    : 'Ask the coach for guidance...'
                  }
                  className={`flex-1 rounded-3xl px-6 py-4 text-base resize-none
                    focus:outline-none focus:ring-2 focus:border-transparent
                    text-[#1A1A1A] dark:text-[#EBEBEB]
                    placeholder-[#6B6B6B] dark:placeholder-[#858585]
                    ${inputMode === 'partner'
                      ? 'bg-white dark:bg-[rgba(40,40,40,0.9)] border border-[rgba(200,220,210,0.6)] dark:border-[rgba(212,232,229,0.25)] focus:ring-[rgba(212,232,229,0.6)]'
                      : 'bg-[rgba(134,199,194,0.3)] dark:bg-[rgba(134,199,194,0.1)] border border-[rgba(100,180,175,0.8)] dark:border-[rgba(134,199,194,0.2)] focus:ring-[rgba(134,199,194,0.5)]'
                    }`}
                  rows={1}
                  disabled={isInputDisabled}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isInputDisabled}
                  className="p-3 rounded-full transition-all flex-shrink-0
                             bg-[rgba(212,232,229,0.4)] hover:bg-[rgba(212,232,229,0.6)]
                             text-[#1A1A1A] dark:text-[#EBEBEB]
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SendIcon />
                </button>
              </div>

              <p className="text-xs text-[#4A4A4A] dark:text-[#858585] text-center pb-2">
                Press Enter to send • Shift+Enter for new line
              </p>
            </div>
          </div>

          {/* MOBILE Input (unchanged) */}
          <div className="md:hidden">
            <MobileMessageInput
              onSendPartner={(content) => sendMessage(content)}
              onSendCoach={(content) => startAside(content)}
              partnerName={shortName}
              disabled={isStreaming || isAsideStreaming || quota?.exhausted || false}
              isInsightsOpen={false}
              onToggleInsights={() => {}}
              onInputFocus={() => {}}
              onInputBlur={() => {}}
            />
          </div>
        </div>

        {/* RIGHT: Desktop Coach Panel */}
        <div className="hidden lg:block lg:w-[400px] xl:w-[450px] p-4 overflow-hidden
                        bg-[#F8F8F8] dark:bg-[#1A1A1A]
                        border-l border-[rgba(200,220,210,0.5)] dark:border-[rgba(255,255,255,0.07)]">
          <DesktopCoachPanel 
            coachMessages={coachMessages}
            asideMessages={asideMessages} 
          />
        </div>
      </div>
    </div>
  );
}