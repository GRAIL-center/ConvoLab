import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import type { AsideMessage } from '../../hooks/useConversationSocket';

interface DesktopCoachPanelProps {
    messages: AsideMessage[];
}

/**
 * NEW Desktop Coach Panel - Always visible on right side
 * This is SEPARATE from your existing mobile CoachInsightsPanel
 * Mobile version stays unchanged!
 */
export function DesktopCoachPanel({ messages }: DesktopCoachPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    // biome-ignore lint/correctness/useExhaustiveDependencies: need to scroll on messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div className="hidden lg:flex lg:flex-col h-full bg-card-bg rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-teal-light/20 px-6 py-4 border-b border-teal-border/30">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-medium/30 flex items-center justify-center">
                        {/* Lightbulb Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                             className="h-5 w-5 text-teal-strong">
                            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                            <path d="M9 18h6" />
                            <path d="M10 22h4" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-text-primary">Coach Insights</h3>
                        <p className="text-sm text-text-secondary">Real-time feedback & guidance</p>
                    </div>
                </div>
            </div>

            {/* Insights list */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.filter(m => m.role === 'coach').length === 0 ? (
                    <div className="text-center py-12 text-text-tertiary">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                             stroke="currentColor" strokeWidth="2" 
                             className="w-12 h-12 mx-auto mb-3 opacity-30">
                            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                            <path d="M9 18h6" />
                            <path d="M10 22h4" />
                        </svg>
                        <p>Coach insights will appear here as the conversation progresses.</p>
                    </div>
                ) : (
                    messages.filter(m => m.role === 'coach').map((msg) => (
                        <InsightCard key={msg.id} message={msg} />
                    ))
                )}
            </div>
        </div>
    );
}

function InsightCard({ message }: { message: AsideMessage }) {
    return (
        <div className="bg-[rgba(26,26,26,1)] dark:bg-[rgba(26,26,26,1)] border border-border-light/20 rounded-xl p-4 hover:border-sage-light/40 transition-colors">
            <div className="flex items-start gap-2">
                {/* Eye icon */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" 
                     strokeWidth={1.5} stroke="currentColor" 
                     className="w-4 h-4 text-sage-medium mt-0.5 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                <div className="flex-1 text-sm text-text-secondary leading-relaxed [&_p]:mb-1 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_strong]:text-text-primary">
                    <Markdown>{message.content}</Markdown>
                </div>
            </div>
        </div>
    );
}
