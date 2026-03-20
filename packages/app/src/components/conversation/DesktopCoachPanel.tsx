import { useEffect, useRef, useMemo } from 'react';
import Markdown from 'react-markdown';
import type { AsideMessage, Message } from '../../hooks/useConversationSocket';

interface DesktopCoachPanelProps {
    coachMessages: Message[];  // Automatic coach insights
    asideMessages: AsideMessage[];  // User questions to coach
}

// Determine insight type based on content
function getInsightType(content: string): 'positive' | 'warning' | 'observation' {
  const lower = content.toLowerCase();
  
  // POSITIVE/SUCCESS (Green)
  if (lower.includes('good') || lower.includes('great') || lower.includes('well done') || 
      lower.includes('excellent') || lower.includes('nice') || lower.includes('perfect') ||
      lower.includes('right approach') || lower.includes('good job') || lower.includes('effective') ||
      lower.includes('helpful') || lower.includes('strong')) {
    return 'positive';
  }
  
  // WARNING/CAUTION (Yellow) - for behavioral feedback
  if (lower.includes('watch') || lower.includes('careful') || lower.includes('might') ||
      lower.includes('could come across') || lower.includes('tone') || lower.includes('consider') ||
      lower.includes('dismissive') || lower.includes('defensive') || lower.includes('try') ||
      lower.includes('avoid') || lower.includes('don\'t')) {
    return 'warning';
  }
  
  // Default to OBSERVATION (Sage)
  return 'observation';
}

export function DesktopCoachPanel({ coachMessages, asideMessages }: DesktopCoachPanelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Combine automatic insights and aside thread
    // Keep them separate to maintain correct ordering
    const allMessages = useMemo(() => {
        // Automatic insights first (sorted by ID)
        const autoInsights = [...coachMessages].sort((a, b) => {
            const idA = a.id === -1 ? Number.MAX_SAFE_INTEGER : a.id;
            const idB = b.id === -1 ? Number.MAX_SAFE_INTEGER : b.id;
            return idA - idB;
        });
        
        // Aside messages maintain their original order (already correct)
        // User question followed by coach response, etc.
        return [
            ...autoInsights.map(m => ({ ...m, source: 'auto' as const })),
            ...asideMessages.map(m => ({ ...m, source: 'aside' as const }))
        ];
    }, [coachMessages, asideMessages]);

    // Auto-scroll to bottom when messages change
    // biome-ignore lint/correctness/useExhaustiveDependencies: need to scroll on messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [allMessages]);

    return (
        <div className="flex flex-col h-full rounded-2xl shadow-xl overflow-hidden border
                        bg-[rgba(255,255,255,0.85)] dark:bg-[rgba(40,40,40,0.9)]
                        border-[rgba(200,220,210,0.5)] dark:border-[rgba(255,255,255,0.05)]">
            {/* Header */}
            <div className="px-6 py-4 border-b
                            bg-[rgba(134,199,194,0.3)] dark:bg-[rgba(134,199,194,0.15)]
                            border-[rgba(100,180,175,0.8)] dark:border-[rgba(134,199,194,0.2)]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center
                                    bg-[rgba(134,199,194,0.5)] dark:bg-[rgba(134,199,194,0.25)]">
                        {/* Lightbulb Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" 
                             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
                             className="h-5 w-5 text-[rgba(50,130,120,1)] dark:text-[rgba(134,199,194,0.9)]">
                            <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                            <path d="M9 18h6" />
                            <path d="M10 22h4" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-[#EBEBEB]">Coach Insights</h3>
                        <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">Real-time feedback & guidance</p>
                    </div>
                </div>
            </div>

            {/* Insights list - SHOW BOTH AUTOMATIC AND USER QUESTIONS */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {allMessages.length === 0 ? (
                    <div className="text-center py-12 text-[#4A4A4A] dark:text-[#858585]">
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
                    allMessages.map((msg) => (
                        msg.role === 'user' ? (
                            <UserQuestionCard key={`${msg.source}-${msg.id}`} message={msg} />
                        ) : (
                            <InsightCard key={`${msg.source}-${msg.id}`} message={msg} />
                        )
                    ))
                )}
            </div>
        </div>
    );
}

// User's question to the coach
function UserQuestionCard({ message }: { message: Message | AsideMessage }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[90%] rounded-xl rounded-tr-sm px-4 py-3 text-sm
                            bg-white dark:bg-[rgba(60,60,60,0.8)]
                            border border-[rgba(200,220,210,0.6)] dark:border-[rgba(212,232,229,0.1)]
                            text-[#1A1A1A] dark:text-[#EBEBEB]">
                {message.content}
            </div>
        </div>
    );
}

// Coach's insight response - EXACT FIGMA COLORS
function InsightCard({ message }: { message: Message | AsideMessage }) {
    const type = getInsightType(message.content);
    
    // EXACT colors from Figma design system
    const colors = {
        positive: {
            bg: 'bg-[rgba(220,252,231,0.6)] dark:bg-[rgba(40,100,60,0.3)]',
            border: 'border-[rgba(34,197,94,0.8)] dark:border-[rgba(80,200,120,0.4)]',
            text: 'text-[#166534] dark:text-[#86EFAC]',
            icon: 'text-[#166534] dark:text-[#86EFAC]'
        },
        warning: {
            bg: 'bg-[rgba(255,248,220,0.6)] dark:bg-[rgba(100,85,30,0.3)]',
            border: 'border-[rgba(255,200,87,0.8)] dark:border-[rgba(200,160,60,0.4)]',
            text: 'text-[#8B6914] dark:text-[#E8D4A0]',
            icon: 'text-[#8B6914] dark:text-[#E8D4A0]'
        },
        observation: {
            bg: 'bg-[rgba(212,232,229,0.4)] dark:bg-[rgba(212,232,229,0.1)]',
            border: 'border-[rgba(180,210,205,0.8)] dark:border-[rgba(212,232,229,0.15)]',
            text: 'text-[#1A1A1A] dark:text-[#D4D4D4]',
            icon: 'text-[#6B6B6B] dark:text-[rgba(212,232,229,0.6)]'
        }
    };

    const { bg, border, text, icon } = colors[type];

    return (
        <div className={`${bg} border ${border} rounded-xl p-4 hover:border-opacity-80 transition-colors`}>
            <div className="flex items-start gap-2">
                {/* Eye icon */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" 
                     strokeWidth={1.5} stroke="currentColor" 
                     className={`w-4 h-4 ${icon} mt-0.5 flex-shrink-0`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                <div className={`flex-1 text-sm ${text} leading-relaxed [&_p]:mb-1 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_strong]:text-[#1A1A1A] dark:[&_strong]:text-[#EBEBEB]`}>
                    <Markdown>{message.content}</Markdown>
                    {'isStreaming' in message && message.isStreaming && (
                        <span className="ml-1 animate-pulse opacity-60">▋</span>
                    )}
                </div>
            </div>
        </div>
    );
}