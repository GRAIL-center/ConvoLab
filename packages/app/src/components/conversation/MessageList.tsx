import { useEffect, useRef } from 'react';
import type { Message } from '../../hooks/useConversationSocket';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    }
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>Send a message to start the conversation</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 space-y-3"
      role="log"
      aria-label="Conversation messages"
    >
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id !== -1 ? message.id : `streaming-${index}`}
          message={message}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
