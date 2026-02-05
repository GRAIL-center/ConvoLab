import Markdown from 'react-markdown';
import type { Message } from '../../hooks/useConversationSocket';

interface MessageBubbleProps {
  message: Message;
}

// Prose-like styling for markdown content
const markdownClasses = `
  [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
  [&_strong]:font-semibold
  [&_em]:italic
  [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2
  [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2
  [&_li]:my-1
  [&_code]:bg-black/10 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm
  [&_pre]:bg-black/10 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2
  [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:my-2
  [&_hr]:my-3 [&_hr]:border-current [&_hr]:opacity-30
`.trim();

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, isStreaming } = message;

  const baseClasses = 'max-w-[80%] rounded-lg px-4 py-2';

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className={`${baseClasses} bg-gray-200 text-gray-900 ${markdownClasses}`}>
          <Markdown>{content}</Markdown>
        </div>
      </div>
    );
  }

  if (role === 'partner') {
    return (
      <div className="flex justify-start">
        <div className={`${baseClasses} bg-white text-gray-900 border border-gray-200 shadow-sm ${markdownClasses}`}>
          <Markdown>{content}</Markdown>
          {isStreaming && <span className="ml-1 animate-pulse">|</span>}
        </div>
      </div>
    );
  }

  // Coach message - centered with distinct styling
  // User requested "Yellow" if uncle is white.
  return (
    <div className="flex justify-center">
      <div
        className={`${baseClasses} bg-yellow-100 text-yellow-900 border border-yellow-200 text-sm ${markdownClasses}`}
      >
        <span className="font-semibold block mb-1">Coach:</span>
        <Markdown>{content}</Markdown>
        {isStreaming && <span className="ml-1 animate-pulse">|</span>}
      </div>
    </div>
  );
}
