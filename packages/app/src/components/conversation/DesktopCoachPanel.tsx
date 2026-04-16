import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import type { AsideMessage, LappScore, Message } from '../../hooks/useConversationSocket';

interface DesktopCoachPanelProps {
  coachMessages: Message[]; // automatic coach responses (role=coach)
  asideMessages: AsideMessage[]; // user Q&A with coach
  lappScores: Map<number, LappScore>;
}

type Tone = 'constructive' | 'warm' | 'neutral' | 'tense';

// Parse **Title** from the first line of coach content
function parseCoachMessage(content: string): { title: string | null; body: string } {
  const boldLineMatch = content.match(/^\*\*(.+?)\*\*\n?/);
  if (boldLineMatch) {
    return { title: boldLineMatch[1], body: content.slice(boldLineMatch[0].length).trim() };
  }
  return { title: null, body: content };
}

// Determine card style from composite score or tone
function getCardStyle(tone: Tone | null) {
  switch (tone) {
    case 'constructive':
      return {
        bg: 'bg-[rgba(220,252,231,0.5)] dark:bg-[rgba(40,100,60,0.25)]',
        border: 'border-[rgba(34,197,94,0.7)] dark:border-[rgba(80,200,120,0.4)]',
        titleColor: 'text-[#166534] dark:text-[#4ade80]',
        iconColor: 'text-[#16a34a] dark:text-[#4ade80]',
        bodyColor: 'text-[#1A1A1A] dark:text-[#D4D4D4]',
      };
    case 'warm':
      return {
        bg: 'bg-[rgba(212,232,229,0.4)] dark:bg-[rgba(212,232,229,0.1)]',
        border: 'border-[rgba(100,180,175,0.7)] dark:border-[rgba(134,199,194,0.3)]',
        titleColor: 'text-[#0f766e] dark:text-[#5eead4]',
        iconColor: 'text-[#0d9488] dark:text-[rgba(134,199,194,0.8)]',
        bodyColor: 'text-[#1A1A1A] dark:text-[#D4D4D4]',
      };
    case 'tense':
      return {
        bg: 'bg-[rgba(255,237,213,0.6)] dark:bg-[rgba(120,50,10,0.3)]',
        border: 'border-[rgba(234,88,12,0.7)] dark:border-[rgba(200,100,40,0.4)]',
        titleColor: 'text-[#9a3412] dark:text-[#fb923c]',
        iconColor: 'text-[#ea580c] dark:text-[#fb923c]',
        bodyColor: 'text-[#1A1A1A] dark:text-[#D4D4D4]',
      };
    default: // neutral or null
      return {
        bg: 'bg-[rgba(212,232,229,0.4)] dark:bg-[rgba(212,232,229,0.1)]',
        border: 'border-[rgba(180,210,205,0.8)] dark:border-[rgba(212,232,229,0.15)]',
        titleColor: 'text-[#1A1A1A] dark:text-[#EBEBEB]',
        iconColor: 'text-[#6B6B6B] dark:text-[rgba(212,232,229,0.6)]',
        bodyColor: 'text-[#1A1A1A] dark:text-[#D4D4D4]',
      };
  }
}

// Coach icon (navigation compass / pin)
function CoachIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    </svg>
  );
}

function CoachInsightCard({ message, tone }: { message: Message; tone: Tone | null }) {
  const { title, body } = parseCoachMessage(message.content);
  const style = getCardStyle(tone);

  return (
    <div className={`${style.bg} border ${style.border} rounded-xl p-4 transition-colors`}>
      {title && (
        <div className={`flex items-center gap-1.5 mb-2`}>
          <CoachIcon className={`w-3.5 h-3.5 ${style.iconColor} flex-shrink-0`} />
          <span className={`text-sm font-semibold ${style.titleColor}`}>{title}</span>
        </div>
      )}
      <div
        className={`text-sm leading-relaxed ${style.bodyColor}
                       [&_p]:mb-1 [&_p:last-child]:mb-0 [&_strong]:font-semibold`}
      >
        <Markdown>{body}</Markdown>
        {'isStreaming' in message && message.isStreaming && (
          <span className="ml-1 animate-pulse opacity-60">▋</span>
        )}
      </div>
    </div>
  );
}

function AsideQuestionCard({ message }: { message: AsideMessage }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[90%] rounded-xl rounded-tr-sm px-4 py-3 text-sm
                      bg-white dark:bg-[rgba(60,60,60,0.8)]
                      border border-[rgba(200,220,210,0.6)] dark:border-[rgba(212,232,229,0.1)]
                      text-[#1A1A1A] dark:text-[#EBEBEB]"
      >
        {message.content}
      </div>
    </div>
  );
}

function AsideResponseCard({ message }: { message: AsideMessage }) {
  return (
    <div
      className="bg-[rgba(212,232,229,0.3)] dark:bg-[rgba(212,232,229,0.08)]
                    border border-[rgba(180,210,205,0.6)] dark:border-[rgba(212,232,229,0.12)]
                    rounded-xl p-3"
    >
      <div
        className="text-sm text-[#1A1A1A] dark:text-[#D4D4D4] leading-relaxed
                      [&_p]:mb-1 [&_p:last-child]:mb-0"
      >
        <Markdown>{message.content}</Markdown>
        {message.isStreaming && <span className="ml-1 animate-pulse opacity-60">▋</span>}
      </div>
    </div>
  );
}

export function DesktopCoachPanel({
  coachMessages,
  asideMessages,
  lappScores,
}: DesktopCoachPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [coachMessages, asideMessages]);

  const hasContent = coachMessages.length > 0 || asideMessages.length > 0;

  return (
    <div
      className="flex flex-col h-full rounded-2xl shadow-xl overflow-hidden border
                    bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(40,40,40,0.9)]
                    border-[rgba(200,220,210,0.5)] dark:border-[rgba(255,255,255,0.05)]"
    >
      {/* Header */}
      <div
        className="px-6 py-4 border-b flex-shrink-0
                      bg-[rgba(134,199,194,0.3)] dark:bg-[rgba(134,199,194,0.15)]
                      border-[rgba(100,180,175,0.8)] dark:border-[rgba(134,199,194,0.2)]"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center
                          bg-[rgba(134,199,194,0.5)] dark:bg-[rgba(134,199,194,0.25)]"
          >
            <CoachIcon className="h-5 w-5 text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.9)]" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-[#EBEBEB]">
              Coach Insights
            </h3>
            <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
              Real-time feedback & guidance
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {!hasContent ? (
          <div className="text-center py-12 text-[#4A4A4A] dark:text-[#858585]">
            <CoachIcon className="w-10 h-10 mx-auto mb-3 opacity-25" />
            <p className="text-sm">
              Coach insights will appear here as the conversation progresses.
            </p>
          </div>
        ) : (
          <>
            {/* Automatic coach insights */}
            {coachMessages.map((msg) => {
              // Find the tone for the user message that preceded this coach message
              // Coach message index in coachMessages → find corresponding score
              const scoreEntry = [...lappScores.values()].find((_, i) => {
                // Match by order: nth coach message corresponds to nth score
                const coachIdx = coachMessages.indexOf(msg);
                return i === coachIdx;
              });
              const tone = scoreEntry?.tone ?? null;
              return (
                <CoachInsightCard
                  key={msg.id !== -1 ? msg.id : `streaming-coach`}
                  message={msg}
                  tone={tone}
                />
              );
            })}

            {/* Aside Q&A divider */}
            {asideMessages.length > 0 && coachMessages.length > 0 && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 border-t border-[rgba(200,220,210,0.4)] dark:border-[rgba(255,255,255,0.06)]" />
                <span className="text-[10px] text-[#6B6B6B] dark:text-[#858585] uppercase tracking-wider">
                  Q&A
                </span>
                <div className="flex-1 border-t border-[rgba(200,220,210,0.4)] dark:border-[rgba(255,255,255,0.06)]" />
              </div>
            )}

            {/* Aside messages */}
            {asideMessages.map((msg) =>
              msg.role === 'user' ? (
                <AsideQuestionCard key={msg.id} message={msg} />
              ) : (
                <AsideResponseCard key={msg.id} message={msg} />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
