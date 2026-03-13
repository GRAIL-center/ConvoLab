import { useEffect, useRef } from 'react';
import type { Message } from '../../hooks/useConversationSocket';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  partnerName?: string;
}

export function MessageList({ messages, isStreaming, partnerName }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on messages change
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    }
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-400 dark:text-[#6B6B6B] text-sm">Send a message to start the conversation</p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
      role="log"
      aria-label="Conversation messages"
    >
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id !== -1 ? message.id : `streaming-${index}`}
          message={message}
          partnerName={partnerName}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}