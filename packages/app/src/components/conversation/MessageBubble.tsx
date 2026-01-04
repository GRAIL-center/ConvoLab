import type { Message } from '../../hooks/useConversationSocket';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, isStreaming } = message;

  const baseClasses = 'max-w-[80%] rounded-lg px-4 py-2 whitespace-pre-wrap';

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className={`${baseClasses} bg-blue-600 text-white`}>{content}</div>
      </div>
    );
  }

  if (role === 'partner') {
    return (
      <div className="flex justify-start">
        <div className={`${baseClasses} bg-gray-200 text-gray-900`}>
          {content}
          {isStreaming && <span className="ml-1 animate-pulse">|</span>}
        </div>
      </div>
    );
  }

  // Coach message - centered with distinct styling
  return (
    <div className="flex justify-center">
      <div
        className={`${baseClasses} bg-amber-100 text-amber-900 border border-amber-200 text-sm italic`}
      >
        <span className="font-medium not-italic">Coach: </span>
        {content}
        {isStreaming && <span className="ml-1 animate-pulse">|</span>}
      </div>
    </div>
  );
}
