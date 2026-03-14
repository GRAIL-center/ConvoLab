import Markdown from 'react-markdown';
import type { Message } from '../../hooks/useConversationSocket';

interface MessageBubbleProps {
  message: Message;
  partnerName?: string;
}

/*
 * ── MESSAGE TEXT SIZE ──────────────────────────────────────────────────────
 * Change the text-* values in each bubble div below to resize message text.
 * Currently text-lg everywhere. Try text-xl to go bigger, text-base smaller.
 */
const markdownClasses = `
  [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_p]:leading-relaxed
  [&_strong]:font-semibold [&_em]:italic
  [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2
  [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2
  [&_li]:my-1
  [&_code]:bg-black/10 dark:bg-white/10 [&_code]:px-1.5 [&_code]:rounded [&_code]:text-base
`.trim();

function isActionText(content: string): boolean {
  const trimmed = content.trim();
  return /^\*[^*\n]+\*$/.test(trimmed) || /^_[^_\n]+_$/.test(trimmed);
}
function extractActionText(content: string): string {
  return content.trim().slice(1, -1);
}

function CharacterAvatar() {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                    bg-[rgba(134,199,194,0.18)] border border-[rgba(134,199,194,0.4)]
                    dark:bg-[rgba(55,55,55,0.9)] dark:border-[rgba(255,255,255,0.1)]">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
           strokeWidth={1.5} stroke="currentColor"
           className="w-5 h-5 text-[rgba(50,130,120,0.9)] dark:text-[#909090]">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    </div>
  );
}

function CoachAvatar() {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                    bg-[rgba(134,199,194,0.2)] border border-[rgba(134,199,194,0.45)]
                    dark:bg-[rgba(134,199,194,0.15)] dark:border-[rgba(134,199,194,0.3)]">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
           className="h-5 w-5 text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.9)]">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
        <path d="M9 18h6"/><path d="M10 22h4"/>
      </svg>
    </div>
  );
}

export function MessageBubble({ message, partnerName }: MessageBubbleProps) {
  const { role, content, isStreaming } = message;

  // Stage direction — centered italic, no bubble
  if (role === 'partner' && isActionText(content)) {
    return (
      <div className="flex justify-center py-2 px-4">
        {/* ACTION TEXT SIZE → text-base, try text-lg to go bigger */}
        <p className="text-base italic text-gray-400 dark:text-[#6B6B6B]">
          {extractActionText(content)}
        </p>
      </div>
    );
  }

  // Partner — left aligned
  if (role === 'partner') {
    return (
      <div className="flex items-start gap-3">
        <CharacterAvatar />
        <div className="max-w-[75%]">
          {/* PARTNER NAME LABEL SIZE → text-sm, try text-base to go bigger */}
          <p className="text-sm text-gray-500 dark:text-[#707070] mb-1.5 font-medium">
            {partnerName || 'Character'}
          </p>
          {/*
           * PARTNER BUBBLE:
           *   Light mode: white card with gray border
           *   Dark mode:  dark gray card
           * BUBBLE TEXT SIZE → text-lg below, try text-xl to go bigger
           */}
          <div className={`rounded-2xl rounded-tl-sm px-5 py-4 text-lg leading-relaxed
                          bg-white border border-gray-200 text-gray-900
                          dark:bg-[rgba(45,45,45,0.95)] dark:border-[rgba(255,255,255,0.07)] dark:text-[#EBEBEB]
                          shadow-sm dark:shadow-none
                          ${markdownClasses}`}>
            <Markdown>{content}</Markdown>
            {isStreaming && <span className="ml-1 animate-pulse opacity-60">▋</span>}
          </div>
        </div>
      </div>
    );
  }

  // Coach — inline (research/observe views)
  if (role === 'coach') {
    return (
      <div className="flex items-start gap-3">
        <CoachAvatar />
        <div className="max-w-[75%]">
          <p className="text-sm text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.8)] mb-1.5 font-medium">
            Coach
          </p>
          <div className={`rounded-2xl rounded-tl-sm px-5 py-4 text-lg leading-relaxed
                          bg-[rgba(134,199,194,0.12)] border border-[rgba(134,199,194,0.3)] text-gray-800
                          dark:bg-[rgba(134,199,194,0.1)] dark:border-[rgba(134,199,194,0.2)] dark:text-[#EBEBEB]
                          ${markdownClasses}`}>
            <Markdown>{content}</Markdown>
            {isStreaming && <span className="ml-1 animate-pulse opacity-60">▋</span>}
          </div>
        </div>
      </div>
    );
  }

  // User — right aligned
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%]">
        {/* YOU LABEL SIZE → text-sm, try text-base to go bigger */}
        <p className="text-sm text-gray-400 dark:text-[#707070] mb-1.5 text-right font-medium">You</p>
        {/*
         * USER BUBBLE:
         *   Light mode: light gray (NOT dark/black)
         *   Dark mode:  medium gray
         * BUBBLE TEXT SIZE → text-lg below, try text-xl to go bigger
         */}
        <div className={`rounded-2xl rounded-tr-sm px-5 py-4 text-lg leading-relaxed
                        bg-gray-200 text-gray-900 border border-gray-300
                        dark:bg-[rgba(80,80,80,0.9)] dark:text-[#F0F0F0] dark:border-[rgba(255,255,255,0.12)]
                        ${markdownClasses}`}>
          <Markdown>{content}</Markdown>
        </div>
      </div>
    </div>
  );
}