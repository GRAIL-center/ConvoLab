import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

interface MobileMessageInputProps {
    onSendPartner: (content: string) => void;
    onSendCoach: (content: string) => void;
    partnerName: string;
    disabled: boolean;
    isInsightsOpen: boolean;
    onToggleInsights: () => void;
    onInputFocus?: () => void;
    onInputBlur?: () => void;
}

type Recipient = 'partner' | 'coach';

export function MobileMessageInput({
    onSendPartner,
    onSendCoach,
    partnerName,
    disabled,
    isInsightsOpen,
    onToggleInsights,
    onInputFocus,
    onInputBlur,
}: MobileMessageInputProps) {
    const [content, setContent] = useState('');
    const [recipient, setRecipient] = useState<Recipient>('partner');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (content.trim() && !disabled) {
            if (recipient === 'partner') {
                onSendPartner(content.trim());
            } else {
                onSendCoach(content.trim());
            }
            setContent('');
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleRecipientSelect = (newRecipient: Recipient) => {
        setRecipient(newRecipient);
        setIsDropdownOpen(false);
    };

    return (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            {/* Input Row */}
            <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="relative" ref={dropdownRef}>

                    <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`flex h-12 w-14 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 ${isDropdownOpen ? 'bg-gray-100 dark:bg-gray-600' : ''}`}
                        aria-label="Switch partner"
                    >
                        {activeIcon(recipient)}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 ml-0.5 opacity-60" aria-hidden="true">
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                    </button>

                    {/* Dropdown Menu Positioned bottom-up or just above */}
                    {isDropdownOpen && (
                        <div className="absolute bottom-14 left-0 w-72 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 shadow-xl ring-1 ring-black/5 dark:ring-white/5 z-20">
                            <button
                                type="button"
                                onClick={() => handleRecipientSelect('partner')}
                                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${recipient === 'partner' ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6" aria-hidden="true">
                                        <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="font-semibold text-base text-gray-900 dark:text-gray-100">{partnerName}</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">Practice conversation</div>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleRecipientSelect('coach')}
                                className={`mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${recipient === 'coach' ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
                                        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                                        <path d="M9 18h6" />
                                        <path d="M10 22h4" />
                                    </svg>
                                </div>
                                <div>
                                    <div className="font-semibold text-base text-gray-900 dark:text-gray-100">Conversation Coach</div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">Ask for advice</div>
                                </div>
                            </button>
                        </div>
                    )}
                </div>

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={onInputFocus}
                    onBlur={onInputBlur}
                    placeholder={recipient === 'partner' ? `Reply to ${partnerName}...` : "Ask the coach..."}
                    disabled={disabled}
                    rows={1}
                    className="flex-1 resize-none rounded-3xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 px-5 py-3 text-base shadow-sm focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                />

                {/* Insights Toggle */}
                <button
                    type="button"
                    onClick={onToggleInsights}
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${isInsightsOpen
                        ? 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700'
                        : 'bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                    aria-label="Toggle insights"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
                        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                        <path d="M9 18h6" />
                        <path d="M10 22h4" />
                    </svg>
                </button>

                <button
                    type="submit"
                    disabled={disabled || !content.trim()}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 disabled:opacity-50"
                    aria-label="Send message"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 -rotate-45 translate-x-0.5 -translate-y-0.5" aria-hidden="true">
                        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                    </svg>
                </button>
            </form>
        </div>
    );
}

function activeIcon(recipient: Recipient) {
    if (recipient === 'partner') {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6" aria-hidden="true">
                <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" />
            </svg>
        );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
            <path d="M9 18h6" />
            <path d="M10 22h4" />
        </svg>
    )
}