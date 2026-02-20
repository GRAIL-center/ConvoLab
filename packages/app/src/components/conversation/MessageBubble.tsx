import Markdown from 'react-markdown';
import type { Message } from '../../hooks/useConversationSocket';

interface MessageBubbleProps {
  message: Message;
}

// Prose-like styling for markdown content with MUCH LARGER fonts
const markdownClasses = `
  [&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_p]:text-xl [&_p]:leading-relaxed
  [&_strong]:font-semibold
  [&_em]:italic
  [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-3 [&_ul]:text-xl
  [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-3 [&_ol]:text-xl
  [&_li]:my-2 [&_li]:text-xl
  [&_code]:bg-black/10 dark:bg-white/10 [&_code]:px-1.5 [&_code]:rounded [&_code]:text-base
  [&_pre]:bg-black/10 dark:bg-white/10 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-3 [&_pre]:text-base
  [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-3 [&_blockquote]:text-xl
  [&_hr]:my-4 [&_hr]:border-current [&_hr]:opacity-30
`.trim();

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, isStreaming } = message;

  const baseClasses = 'max-w-[85%] rounded-2xl px-6 py-4';

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className={`${baseClasses} bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xl ${markdownClasses}`}>
          <Markdown>{content}</Markdown>
        </div>
      </div>
    );
  }

  if (role === 'partner') {
    return (
      <div className="flex justify-start">
        <div className={`${baseClasses} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-sm text-xl ${markdownClasses}`}>
          <Markdown>{content}</Markdown>
          {isStreaming && <span className="ml-1 animate-pulse text-xl">|</span>}
        </div>
      </div>
    );
  }

  // Coach message - centered with distinct styling
  return (
    <div className="flex justify-center">
      <div
        className={`${baseClasses} bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100 border border-yellow-200 dark:border-yellow-700 ${markdownClasses}`}
      >
        <span className="font-semibold block mb-2 text-xl">Coach:</span>
        <Markdown>{content}</Markdown>
        {isStreaming && <span className="ml-1 animate-pulse text-xl">|</span>}
      </div>
    </div>
  );
}