import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Markdown from 'react-markdown';
import { ArrowLeft, MessageSquare, Lightbulb, Send } from 'lucide-react';
import { MessageList } from '../components/conversation/MessageList';
import { MobileMessageInput } from '../components/conversation/MobileMessageInput';
import { DesktopCoachPanel } from '../components/conversation/DesktopCoachPanel';
import { Button } from '../components/ui/Button';
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

// "Angry Uncle at Thanksgiving" → "Angry Uncle"
function getShortName(scenario: { name?: string; partnerPersona?: string } | null | undefined): string {
  if (!scenario) return 'Partner';
  if (scenario.name) {
    const beforeAt = scenario.name.split(/\s+at\s+/i)[0].trim();
    if (beforeAt) return beforeAt;
  }
  return scenario.partnerPersona?.split(' ').slice(0, 3).join(' ') ?? 'Partner';
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
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[rgba(40,90,80,1)] dark:text-[#EBEBEB]
                       hover:bg-[rgba(130,167,161,0.35)] transition-colors"
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
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const coachInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    status,
    scenario,
    messages,
    sendMessage,
    isStreaming,
    streamingRole,
    quota,
    error,
    asideMessages,
    isAsideStreaming,
    asideError,
    startAside,
    cancelAside,
  } = useConversationSocket(sessionId);

  // Auto-scroll main messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (messageInputRef.current?.value.trim()) {
      sendMessage(messageInputRef.current.value.trim());
      messageInputRef.current.value = '';
    }
  };

  const handleAskCoach = () => {
    if (coachInputRef.current?.value.trim()) {
      startAside(coachInputRef.current.value.trim());
      coachInputRef.current.value = '';
    }
  };

  const handleMessageKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCoachKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskCoach();
    }
  };

  const mainMessages = messages.filter(m => m.role !== 'coach');
  const shortName = getShortName(scenario);

  // Loading state
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

  // Error state
  if (status === 'error' && error && !error.recoverable) {
    return (
      <FullScreenMessage
        title="Connection Error"
        titleColor="text-red-500 dark:text-[#FCA5A5]"
        message={error.message}
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[rgba(40,90,80,1)] dark:text-[#EBEBEB]
                       hover:bg-[rgba(130,167,161,0.35)] transition-colors"
          >
            Refresh Page
          </button>
        }
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[#F5F5F4] dark:bg-[#1A1A1A]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[rgba(30,30,30,0.95)] px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-full hover:bg-sage-light/15 transition-colors"
            type="button"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-900 dark:text-[#EBEBEB]" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-[#EBEBEB]">
              {scenario?.name || 'Conversation'}
            </h1>
            {scenario?.partnerPersona && (
              <p className="text-sm text-gray-500 dark:text-[#A0A0A0]">
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
              <MessageList messages={mainMessages} partnerName={scenario?.partnerPersona} isStreaming={isStreaming} />
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* DESKTOP Input area */}
          <div className="hidden md:block border-t border-gray-200 dark:border-[rgba(255,255,255,0.07)] bg-white dark:bg-[rgba(30,30,30,0.95)] px-6 py-4">
            <div className="mx-auto max-w-4xl space-y-3">
              {/* Message input with send button */}
              <div className="flex gap-2">
                <textarea
                  ref={messageInputRef}
                  onKeyDown={handleMessageKeyDown}
                  placeholder={`Type your response to ${shortName}...`}
                  className="flex-1 bg-gray-100 dark:bg-card-bg border border-gray-300 dark:border-border-medium rounded-3xl px-6 py-4 text-base text-gray-900 dark:text-text-primary placeholder-gray-400 dark:placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-sage-medium focus:border-transparent resize-none"
                  rows={1}
                  disabled={isStreaming || quota?.exhausted}
                />
                <Button
                  variant="icon"
                  onClick={handleSendMessage}
                  disabled={isStreaming || quota?.exhausted}
                  type="button"
                  className="flex-shrink-0"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleSendMessage}
                  disabled={isStreaming || quota?.exhausted}
                  type="button"
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Reply to {shortName}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => coachInputRef.current?.focus()}
                  disabled={isAsideStreaming}
                  type="button"
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Lightbulb className="w-4 h-4" />
                  Ask the Coach
                </Button>
              </div>

              {/* Coach question input */}
              <div className="flex gap-2">
                <textarea
                  ref={coachInputRef}
                  onKeyDown={handleCoachKeyDown}
                  placeholder="Ask the coach for guidance..."
                  className="flex-1 bg-teal-light/10 border border-teal-border/40 rounded-3xl px-6 py-4 text-base text-gray-900 dark:text-text-primary placeholder-gray-400 dark:placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-teal-medium focus:border-transparent resize-none"
                  rows={1}
                  disabled={isAsideStreaming}
                />
              </div>

              <p className="text-xs text-gray-400 dark:text-text-tertiary text-center pb-2">
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

        {/* RIGHT: Desktop Coach Panel (NEW!) */}
        <div className="hidden lg:block lg:w-[400px] xl:w-[450px] border-l border-gray-200 dark:border-[rgba(255,255,255,0.07)] bg-[#F5F5F4] dark:bg-[#1A1A1A] p-4">
          <DesktopCoachPanel messages={asideMessages} />
        </div>
      </div>
    </div>
  );
}
