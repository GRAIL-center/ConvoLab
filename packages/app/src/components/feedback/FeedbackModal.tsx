import { useState } from 'react';

export type FeedbackPayload = {
  sessionId: number;
  rating: number;  // 1–5
  message: string; // optional
};

const Star = ({ filled }: { filled: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={`h-8 w-8 drop-shadow-sm ${filled ? 'text-amber-400' : 'text-gray-200'}`}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2.5 9.19 9.2H2.1l5.7 4.14-2.17 6.73L12 16.9l6.37 3.17-2.17-6.73 5.7-4.14h-7.09L12 2.5Z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-500" stroke="currentColor" fill="none">
    <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type SubmitState = 'idle' | 'saving' | 'success' | 'error';

export function FeedbackModal({
  sessionId,
  open,
  onClose,
  onSubmit,
  submitState = 'idle',
  errorMessage,
}: {
  sessionId: number;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FeedbackPayload) => Promise<void> | void;
  submitState?: SubmitState;
  errorMessage?: string;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState('');

  if (!open) return null;

  const handleSubmit = async () => {
    await onSubmit({ sessionId, rating, message: message.trim() });
  };

  const disabled = submitState === 'saving' || rating === 0;
  const showSaved = submitState === 'success';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Feedback</p>
            <h2 className="text-lg font-semibold text-gray-900">Rate this conversation</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 hover:bg-gray-100"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => {
              const active = (hover || rating) >= value;
              return (
                <button
                  key={value}
                  type="button"
                  onMouseEnter={() => setHover(value)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(value)}
                  className="p-1"
                  aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
                >
                  <Star filled={active} />
                </button>
              );
            })}
          </div>

          <label className="block space-y-2 text-sm text-gray-700">
            <span className="font-medium">What worked or what should improve?</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Optional: details about the partner or coach responses…"
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-gray-500">Session ID: {sessionId}</span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {submitState === 'saving' ? 'Sending…' : showSaved ? 'Saved' : 'Submit'}
          </button>
        </div>
        {submitState === 'error' && (
          <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
            {errorMessage ?? 'Failed, try again.'}
          </div>
        )}
      </div>
    </div>
  );
}
