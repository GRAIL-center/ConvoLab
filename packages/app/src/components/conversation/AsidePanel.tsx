import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import type { AsideError, AsideMessage } from '../../hooks/useConversationSocket';

// Prose-like styling for markdown content (matching MessageBubble)
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

interface AsidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: AsideMessage[];
  isStreaming: boolean;
  error: AsideError | null;
  onSend: (question: string) => void;
  onCancel: () => void;
}

function AsideMessageBubble({ message }: { message: AsideMessage }) {
  const { role, content, isStreaming } = message;

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className={`max-w-[85%] rounded-lg px-3 py-2 bg-amber-500 text-white ${markdownClasses}`}
        >
          <Markdown>{content}</Markdown>
        </div>
      </div>
    );
  }

  // Coach response
  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 bg-gray-100 text-gray-900 ${markdownClasses}`}
      >
        <Markdown>{content}</Markdown>
        {isStreaming && <span className="ml-1 animate-pulse">|</span>}
      </div>
    </div>
  );
}

export function AsidePanel({
  isOpen,
  onClose,
  messages,
  isStreaming,
  error,
  onSend,
  onCancel,
}: AsidePanelProps) {
  const [question, setQuestion] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive or content changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally re-run when messages array changes
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (question.trim() && !isStreaming) {
      onSend(question.trim());
      setQuestion('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleClose = () => {
    if (isStreaming) {
      onCancel();
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/30 transition-opacity duration-200 md:hidden cursor-default"
          onClick={handleClose}
          aria-label="Close aside panel"
        />
      )}

      {/* Panel */}
      <div
        className={`fixed z-50 bg-white shadow-xl flex flex-col transform transition-transform duration-300 ease-out
          bottom-0 left-0 w-full h-[85vh] rounded-t-2xl md:rounded-none
          md:top-0 md:right-0 md:h-full md:w-[400px] md:bottom-auto md:left-auto
          ${isOpen
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-x-full md:translate-y-0'
          }`}
        role="dialog"
        aria-label="Ask Coach"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-50 rounded-t-2xl md:rounded-none">
          <h2 className="text-lg font-semibold text-amber-900">Ask Coach</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:bg-amber-100 text-amber-700"
            aria-label="Close panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" className="md:hidden" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" className="hidden md:block" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center text-gray-500 text-sm py-8">
              <p>Ask the coach a private question.</p>
              <p className="mt-2 text-xs">
                The coach can see your full conversation and will provide focused guidance.
              </p>
            </div>
          )}
          {messages.map((msg, i) => (
            <AsideMessageBubble key={msg.id !== -1 ? msg.id : `streaming-${i}`} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-sm border-t border-red-200">
            {error.message}
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleSubmit} className="border-t bg-white p-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the coach a question..."
              disabled={isStreaming}
              rows={1}
              aria-label="Question input"
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-gray-100 disabled:text-gray-500"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600 text-sm"
              >
                Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!question.trim()}
                className="rounded-lg bg-amber-500 px-4 py-2 text-white hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              >
                Ask
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
