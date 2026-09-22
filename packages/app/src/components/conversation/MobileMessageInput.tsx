import { type FormEvent, type KeyboardEvent, useState } from 'react';

interface MobileMessageInputProps {
  onSendPartner: (content: string) => void;
  partnerName: string;
  disabled: boolean;
  onInputChange?: (value: string) => void;
}

/**
 * The narrow-screen composer. It only ever addresses the partner.
 *
 * It used to carry a recipient dropdown that could switch to the coach, but
 * nothing on a narrow screen rendered the coach's reply, so choosing "coach"
 * sent a question into a thread the participant could not see and read as the
 * app doing nothing at all. Asking the coach now happens inside the coach
 * sheet, next to its answers.
 */
export function MobileMessageInput({
  onSendPartner,
  partnerName,
  disabled,
  onInputChange,
}: MobileMessageInputProps) {
  const [content, setContent] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    onSendPartner(trimmed);
    setContent('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="border-t border-[#ddd8cc] bg-[#fbfaf6] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-[#2b2925] dark:bg-[#151513]">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            onInputChange?.(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={`Reply to ${partnerName}...`}
          disabled={disabled}
          rows={1}
          className="min-h-[48px] flex-1 resize-none rounded-3xl border border-[#d8d3c8] bg-[#f6f4ee] px-5 py-3 text-base text-[#24221d] outline-none placeholder:text-[#8c877d] focus:border-[#b9b3a6] disabled:opacity-50 dark:border-[#34312c] dark:bg-[#1b1a17] dark:text-[#efece4] dark:placeholder:text-[#77736b]"
        />

        <button
          type="submit"
          disabled={disabled || !content.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#24221d] text-white transition-colors hover:bg-[#3a362f] disabled:bg-[#e0ddd4] disabled:text-[#928d84] dark:bg-[#eeeae1] dark:text-[#151513] dark:hover:bg-white dark:disabled:bg-[#2d2b27] dark:disabled:text-[#77736b]"
          aria-label={`Send reply to ${partnerName}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5 -rotate-45 translate-x-0.5 -translate-y-0.5"
            aria-hidden="true"
          >
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
