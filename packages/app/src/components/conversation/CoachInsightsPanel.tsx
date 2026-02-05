import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import type { AsideMessage } from '../../hooks/useConversationSocket';

interface CoachInsightsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    messages: AsideMessage[];
}

export function CoachInsightsPanel({ isOpen, onClose, messages }: CoachInsightsPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    // biome-ignore lint/correctness/useExhaustiveDependencies: need to scroll on messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    if (!isOpen) return null;

    return (
        <div className="flex flex-col border-t border-gray-200 bg-gray-50 md:hidden h-[40dvh]">
            {/* 
                Keyboard Replacement View:
                - Fixed height (approx keyboard height, e.g. 40dvh)
                - No header (clean keyboard look)
                - Scrollable content
             */}

            {/* Content */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
            >
                {messages.filter(m => m.role === 'coach').length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center text-sm text-gray-400">
                        <p>No insights yet...</p>
                    </div>
                ) : (
                    messages.filter(m => m.role === 'coach').map((msg) => (
                        <InsightCard key={msg.id} message={msg} />
                    ))
                )}
            </div>

            {/* Optional: Small 'close' or 'hide' handle if needed, but blurring input typically handles it. 
                 We can keep a small subtle indicator or close button if user gets stuck.
             */}
            <div className="flex justify-center pb-2 pt-1 border-t border-gray-100 bg-gray-50">
                <button type="button" onClick={onClose} className="h-1 w-12 rounded-full bg-gray-300" aria-label="Close panel" />
            </div>
        </div>
    );
}


function InsightCard({ message }: { message: AsideMessage }) {
    if (message.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="rounded-xl bg-gray-200 px-3 py-2 text-sm text-gray-800 max-w-[85%]">
                    {message.content}
                </div>
            </div>
        );
    }

    // Standard Card view (Green/Teal)
    return (
        <div className="rounded-xl border border-teal-100 bg-teal-50 p-3 shadow-sm">
            <div className="flex gap-3">
                <div className="mt-0.5 shrink-0 text-teal-800">
                    {/* Lightbulb Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                        <path d="M9 18h6" />
                        <path d="M10 22h4" />
                    </svg>
                </div>
                <div className="text-sm text-gray-800 flex-1 [&_p]:mb-1 [&_p:last-child]:mb-0 [&_p]:leading-snug [&_strong]:font-bold [&_strong]:text-teal-900">
                    <Markdown>{message.content}</Markdown>
                </div>
            </div>
        </div>
    );
}
