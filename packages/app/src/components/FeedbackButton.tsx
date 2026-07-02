import { useMutation } from '@tanstack/react-query';
import Recaptcha from './Recaptcha';
import { useCallback, useEffect, useState } from 'react';
import { useTRPC } from '../api/trpc';

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trpc = useTRPC();
  const submit = useMutation(trpc.feedback.submit.mutationOptions());

  const closeAndReset = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      setRating(0);
      setHoverRating(0);
      setComment('');
      setSubmitted(false);
      setError(null);
    }, 200);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndReset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeAndReset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError('Please pick a rating.');
      return;
    }
    if (!recaptchaToken) {
      setError('Please complete the CAPTCHA.');
      return;
    }
    setError(null);
    try {
      await submit.mutateAsync({
        rating,
        comment: comment.trim() || undefined,
        recaptchaToken: recaptchaToken,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback');
    }
  };

  const displayed = hoverRating || rating;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2
                   rounded-full px-4 py-2.5 text-sm font-medium shadow-lg
                   bg-[rgba(134,199,194,0.95)] dark:bg-[rgba(134,199,194,0.85)]
                   text-[rgba(35,75,70,1)] dark:text-[rgba(20,40,38,1)]
                   hover:bg-[rgba(120,190,184,1)] dark:hover:bg-[rgba(150,210,205,0.95)]
                   transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>

      {isOpen && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={closeAndReset}
            onKeyDown={(e) => e.key === 'Escape' && closeAndReset()}
            role="presentation"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2
                       rounded-2xl p-6 shadow-2xl
                       bg-white dark:bg-[rgba(40,40,40,0.98)]
                       border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]"
          >
            {submitted ? (
              <div className="text-center py-4">
                <div
                  className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3
                             bg-[rgba(134,199,194,0.3)] dark:bg-[rgba(134,199,194,0.2)]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6 text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.95)]"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3
                  id="feedback-title"
                  className="text-lg font-semibold text-gray-900 dark:text-[#EBEBEB]"
                >
                  Thanks for your feedback!
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-[#A0A0A0]">
                  We appreciate you taking the time.
                </p>
                <button
                  type="button"
                  onClick={closeAndReset}
                  className="mt-5 w-full rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]
                             px-4 py-2 text-sm text-gray-700 dark:text-[#EBEBEB]
                             hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                             transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex items-start justify-between mb-1">
                  <h3
                    id="feedback-title"
                    className="text-lg font-semibold text-gray-900 dark:text-[#EBEBEB]"
                  >
                    Share feedback
                  </h3>
                  <button
                    type="button"
                    onClick={closeAndReset}
                    aria-label="Close"
                    className="-mt-1 -mr-1 p-1 rounded text-gray-400 hover:text-gray-600 dark:text-[#6B6B6B] dark:hover:text-[#A0A0A0]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-5 h-5"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-gray-500 dark:text-[#A0A0A0] mb-4">
                  How would you rate your experience?
                </p>

                {/* biome-ignore lint/a11y/noStaticElementInteractions: onMouseLeave is a hover-only enhancement */}
                <div
                  className="flex justify-center gap-1 mb-4"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      onMouseEnter={() => setHoverRating(value)}
                      aria-label={`${value} star${value === 1 ? '' : 's'}`}
                      className="p-1 rounded transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(134,199,194,0.6)]"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill={value <= displayed ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className={`w-8 h-8 transition-colors ${
                          value <= displayed
                            ? 'text-[rgba(245,180,55,1)]'
                            : 'text-gray-300 dark:text-[#4A4A4A]'
                        }`}
                        aria-hidden="true"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  ))}
                </div>

                <label
                  htmlFor="feedback-comment"
                  className="block text-sm font-medium text-gray-700 dark:text-[#B0B0B0] mb-1.5"
                >
                  Tell us more <span className="text-gray-400 dark:text-[#6B6B6B]">(optional)</span>
                </label>
                <textarea
                  id="feedback-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="What worked well? What could be better?"
                  className="w-full px-3 py-2 rounded-lg text-sm
                             bg-white dark:bg-[rgba(38,38,38,0.95)]
                             border border-gray-200 dark:border-[rgba(255,255,255,0.09)]
                             text-gray-900 dark:text-[#EBEBEB]
                             placeholder-gray-400 dark:placeholder-[#4A4A4A]
                             focus:outline-none
                             focus:border-[rgba(130,167,161,0.6)] dark:focus:border-[rgba(212,232,229,0.3)]
                             focus:ring-2 focus:ring-[rgba(130,167,161,0.12)] dark:focus:ring-[rgba(212,232,229,0.07)]
                             transition-colors resize-none"
                />

                {error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                    {error}
                  </p>
                )}

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="flex-1 rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]
                               px-4 py-2 text-sm text-gray-700 dark:text-[#A0A0A0]
                               hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                               transition-colors"
                  >
                    Cancel
                  </button>
                    <Recaptcha onChange={setRecaptchaToken} />
                    <button
                      type="submit"
                      disabled={submit.isPending || rating < 1 || !recaptchaToken}
                      className="flex-1 rounded-lg px-4 py-2 text-sm font-medium
                                 bg-[rgba(134,199,194,0.95)] dark:bg-[rgba(134,199,194,0.85)]
                                 text-[rgba(35,75,70,1)] dark:text-[rgba(20,40,38,1)]
                                 hover:bg-[rgba(120,190,184,1)] dark:hover:bg-[rgba(150,210,205,0.95)]
                                 disabled:opacity-50 disabled:cursor-not-allowed
                                 transition-colors"
                    >
                      {submit.isPending ? 'Sending...' : 'Send feedback'}
                    </button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
