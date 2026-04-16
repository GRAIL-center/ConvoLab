import Markdown from 'react-markdown';
import type { Message } from '../../hooks/useConversationSocket';

type MessageTone = 'constructive' | 'warm' | 'neutral' | 'tense' | null;

const TONE_BORDER: Record<NonNullable<MessageTone>, string> = {
  constructive: 'border-[rgba(34,197,94,0.7)] dark:border-[rgba(80,200,120,0.5)]',
  warm: 'border-[rgba(100,180,175,0.7)] dark:border-[rgba(134,199,194,0.5)]',
  neutral: 'border-[rgba(200,220,210,0.5)] dark:border-[rgba(255,255,255,0.05)]',
  tense: 'border-[rgba(234,88,12,0.7)] dark:border-[rgba(200,100,40,0.6)]',
};

interface MessageBubbleProps {
  message: Message;
  partnerName?: string;
  tone?: MessageTone;
}

export function MessageBubble({ message, partnerName, tone }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isPartner = message.role === 'partner';
  const isCoach = message.role === 'coach';

  // User message - right-aligned, gray, tone-colored border
  if (isUser) {
    const borderClass = tone ? TONE_BORDER[tone] : TONE_BORDER.neutral;
    return (
      <div className="flex justify-end mb-4">
        <div
          className={`max-w-[75%] rounded-xl rounded-tr-sm px-5 py-3.5
                        bg-[rgba(230,230,230,1)] dark:bg-[rgba(60,60,60,0.8)]
                        text-[#1A1A1A] dark:text-[#EBEBEB]
                        border ${borderClass}`}
        >
          <div className="text-base leading-relaxed whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  // Partner message - left-aligned, with avatar, sage border (EXACT FIGMA)
  if (isPartner) {
    return (
      <div className="flex gap-3 mb-4">
        {/* Partner Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-1
                        bg-[rgba(200,200,200,1)] dark:bg-[rgba(60,60,60,1)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-6 h-6 text-[#6B6B6B] dark:text-[#858585]"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* Message Content */}
        <div className="flex-1 max-w-[75%]">
          <div
            className="text-xs font-medium mb-1
                          text-[#4A4A4A] dark:text-[#A0A0A0]"
          >
            {partnerName || 'Partner'}
          </div>
          <div
            className="rounded-xl rounded-tl-sm px-5 py-3.5
                          bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(40,40,40,0.9)]
                          border-l-4 border-[rgba(180,210,205,0.8)] dark:border-[rgba(212,232,229,0.4)]
                          text-[#1A1A1A] dark:text-[#EBEBEB]"
          >
            <div className="text-base leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
              <Markdown>{message.content}</Markdown>
            </div>
            {message.action && (
              <div
                className="mt-3 pt-3 text-sm italic
                              border-t border-[rgba(200,220,210,0.6)] dark:border-[rgba(255,255,255,0.1)]
                              text-[#4A4A4A] dark:text-[#A0A0A0]"
              >
                {message.action}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Coach message - left-aligned, teal background + bold left border (EXACT FIGMA)
  if (isCoach) {
    return (
      <div className="flex gap-3 mb-4">
        {/* Coach Avatar - Lightbulb */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-1
                        bg-[rgba(134,199,194,0.5)] dark:bg-[rgba(134,199,194,0.25)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-5 h-5 text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.9)]"
            aria-hidden="true"
          >
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6" />
            <path d="M10 22h4" />
          </svg>
        </div>

        {/* Message Content */}
        <div className="flex-1 max-w-[75%]">
          <div
            className="text-xs font-semibold mb-1
                          text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.8)]"
          >
            Coach
          </div>
          <div
            className="rounded-xl rounded-tl-sm px-5 py-3.5
                          bg-[rgba(134,199,194,0.3)] dark:bg-[rgba(134,199,194,0.1)]
                          border-l-4 border-[rgba(100,180,175,0.8)] dark:border-[rgba(134,199,194,0.5)]
                          text-[#1A1A1A] dark:text-[#D4D4D4]"
          >
            <div className="text-base leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-[#1A1A1A] dark:[&_strong]:text-[#EBEBEB]">
              <Markdown>{message.content}</Markdown>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
