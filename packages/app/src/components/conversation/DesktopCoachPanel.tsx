import {
  type Dispatch,
  Fragment,
  type KeyboardEvent,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
} from 'react';
import Markdown from 'react-markdown';
import type { AsideMessage, LappScore, Message } from '../../hooks/useConversationSocket';

interface DesktopCoachPanelProps {
  coachMessages: Message[]; // automatic coach responses (role=coach)
  asideMessages: AsideMessage[]; // user Q&A with coach
  lappScores: Map<string, LappScore>;
  coachDraft: string;
  setCoachDraft: Dispatch<SetStateAction<string>>;
  onCoachKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendCoach: () => void;
  coachInputRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  partnerName: string;
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
                      bg-gray-200 dark:bg-[rgba(60,60,60,0.8)]
                      border border-gray-300 dark:border-[rgba(212,232,229,0.1)]
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
  coachDraft,
  setCoachDraft,
  onCoachKeyDown,
  onSendCoach,
  coachInputRef,
  disabled,
  partnerName,
}: DesktopCoachPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [coachMessages, asideMessages]);

  const hasContent = coachMessages.length > 0 || asideMessages.length > 0;

  // Automatic insights and aside Q&A are two streams that interleave in time.
  // They used to render as two fixed blocks — every insight above, all Q&A
  // below — and because the panel auto-scrolls to the bottom, asking the coach
  // one question pinned the view to the Q&A and every later insight was
  // inserted off-screen above it. It looked exactly like the coach had stopped
  // responding. Merging them chronologically keeps new insights where the
  // participant is already looking.
  //
  // Tone: the Nth insight follows the (N+1)th scored turn, because the coach
  // stays silent after the first exchange while the scorer does not. Indexing
  // the two lists together, as this did before, tinted every insight with the
  // previous turn's tone.
  const scoresByTurn = [...lappScores.values()].sort((a, b) => a.turnNumber - b.turnNumber);
  const panelItems = [
    ...coachMessages.map((msg, index) => ({
      kind: 'insight' as const,
      key: msg.id !== -1 ? `insight-${msg.id}` : 'insight-streaming',
      ts: msg.timestamp,
      msg,
      tone: (scoresByTurn[index + 1]?.tone ?? null) as Tone | null,
    })),
    ...asideMessages.map((msg, index) => ({
      kind: 'aside' as const,
      key: msg.id !== -1 ? `aside-${msg.id}` : `aside-streaming-${index}`,
      ts: msg.timestamp,
      msg,
      tone: null as Tone | null,
    })),
  ].sort((a, b) => a.ts.localeCompare(b.ts));
  const quickPrompts = ['How am I doing?', 'What should I try next?', 'Was that too aggressive?'];

  return (
    <div className="flex h-full flex-col px-7 py-7">
      <div className="shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-serif text-2xl text-[#2e2b25] dark:text-[#f2efe7]">Coach</h3>
          <span className="rounded-full border border-[#d8d3c8] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#77736b] dark:border-[#34312c] dark:text-[#8f8a82]">
            Private
          </span>
        </div>
        <p className="mt-2 text-sm text-[#6f6a61] dark:text-[#9d9890]">
          {partnerName} can't see this side of the room.
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-7 space-y-4">
        {!hasContent ? (
          <div className="pt-4 text-[#6f6a61] dark:text-[#9d9890]">
            <p className="text-base leading-relaxed">
              I'll drop in tips as you go - or ask me anything.
            </p>
          </div>
        ) : (
          panelItems.map((item, index) => {
            const previous = panelItems[index - 1];
            // A divider whenever the stream changes hands, so a run of Q&A is
            // visually distinct without being banished to the bottom.
            const divider =
              previous && previous.kind !== item.kind ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 border-t border-[#d8d3c8] dark:border-[#34312c]" />
                  <span className="text-[10px] text-[#77736b] dark:text-[#8f8a82] uppercase tracking-wider">
                    {item.kind === 'aside' ? 'Q&A' : 'Coaching'}
                  </span>
                  <div className="flex-1 border-t border-[#d8d3c8] dark:border-[#34312c]" />
                </div>
              ) : null;

            if (item.kind === 'insight') {
              return (
                <Fragment key={item.key}>
                  {divider}
                  <CoachInsightCard message={item.msg} tone={item.tone} />
                </Fragment>
              );
            }
            return (
              <Fragment key={item.key}>
                {divider}
                {item.msg.role === 'user' ? (
                  <AsideQuestionCard message={item.msg} />
                ) : (
                  <AsideResponseCard message={item.msg} />
                )}
              </Fragment>
            );
          })
        )}
      </div>

      <div className="shrink-0 space-y-4">
        <div className="flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setCoachDraft(prompt);
                coachInputRef.current?.focus();
              }}
              className="rounded-full border border-[#d8d3c8] px-4 py-2 text-sm text-[#6c675e] transition-colors hover:bg-[#eeeae1] dark:border-[#34312c] dark:text-[#aaa59b] dark:hover:bg-[#22211d]"
            >
              {prompt}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 rounded-[22px] border border-[#d8d3c8] bg-[#f6f4ee] p-3 dark:border-[#34312c] dark:bg-[#1b1a17]">
          <textarea
            ref={coachInputRef}
            value={coachDraft}
            onChange={(event) => setCoachDraft(event.target.value)}
            onKeyDown={onCoachKeyDown}
            placeholder="Ask your coach..."
            rows={1}
            disabled={disabled}
            className="min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#24221d] outline-none placeholder:text-[#8c877d] disabled:opacity-50 dark:text-[#efece4] dark:placeholder:text-[#77736b]"
          />
          <button
            type="button"
            onClick={onSendCoach}
            disabled={disabled || !coachDraft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d8d3c8] text-[#5f5a51] transition-colors hover:bg-[#eeeae1] disabled:opacity-40 dark:border-[#34312c] dark:text-[#b5b0a6] dark:hover:bg-[#24231f]"
            aria-label="Send question to coach"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0-6 6m6-6 6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
