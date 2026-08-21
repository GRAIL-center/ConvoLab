import { useMutation } from '@tanstack/react-query';
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import { DesktopCoachPanel } from '../components/conversation/DesktopCoachPanel';
import { LappMetricsPanel } from '../components/conversation/LappMetricsPanel';
import { MessageList } from '../components/conversation/MessageList';
import { MobileMessageInput } from '../components/conversation/MobileMessageInput';
import { ThemeToggle } from '../components/ThemeToggle';
import { useConversationSocket } from '../hooks/useConversationSocket';

// Inline SVG Icons
const ArrowLeftIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);

const SendIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
    />
  </svg>
);

function FullScreenMessage({
  title,
  titleColor = 'text-[#1A1A1A] dark:text-[#EBEBEB]',
  message,
  action,
}: {
  title?: string;
  titleColor?: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#F8F8F8] dark:bg-[#1A1A1A]">
      <div className="text-center">
        {title && <h1 className={`text-2xl font-bold ${titleColor}`}>{title}</h1>}
        {message && <div className="mt-2 text-[#6B6B6B] dark:text-[#A0A0A0]">{message}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

// Opening suggestions for the non-study practice app. Deliberately NOT shown in
// study sessions: an experimenter-supplied opener would shape the participant's
// first turn, which is a scored turn, and would land in both arms unequally.
// Kept topic-agnostic so they read sensibly for any partisan scenario.
const OPENING_PROMPTS = [
  'What matters most to you here?',
  'How did you come to see it that way?',
  'What do people get wrong about your side?',
];

// "Angry Uncle at Thanksgiving" → "Angry Uncle"
function getShortName(
  scenario: { name?: string; partnerPersona?: string } | null | undefined
): string {
  if (!scenario) return 'Partner';
  if (scenario.name) {
    const beforeAt = scenario.name.split(/\s+at\s+/i)[0].trim();
    if (beforeAt) return beforeAt;
  }
  return scenario.partnerPersona?.split(' ').slice(0, 3).join(' ') ?? 'Partner';
}

export function Conversation() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  if (!sessionId) {
    return (
      <FullScreenMessage
        title="Invalid Session"
        titleColor="text-[#991B1B] dark:text-[#FCA5A5]"
        message="The session ID is not valid."
        action={
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(212,232,229,0.6)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[#1A1A1A] dark:text-[#EBEBEB]
                       hover:bg-[rgba(212,232,229,0.8)] transition-colors"
          >
            Go Home
          </button>
        }
      />
    );
  }

  return <ConversationContent sessionId={sessionId} />;
}

function ConversationContent({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const coachInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [partnerDraft, setPartnerDraft] = useState('');
  const [coachDraft, setCoachDraft] = useState('');
  const [hasActivatedRails, setHasActivatedRails] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [fallbackSurveyUrl, setFallbackSurveyUrl] = useState<string | null>(null);
  const [isPostSurveyMissing, setIsPostSurveyMissing] = useState(false);

  const {
    status,
    scenario,
    study,
    messages,
    sendMessage,
    isStreaming,
    quota,
    error,
    lappScores,
    asideMessages,
    isAsideStreaming,
    startAside,
  } = useConversationSocket(sessionId);

  const finishMutation = useMutation({
    ...trpc.study.finish.mutationOptions(),
    onSuccess: (data) => {
      setIsRedirecting(true);
      if (data.postSurveyUrl) {
        setFallbackSurveyUrl(data.postSurveyUrl);
        window.location.assign(data.postSurveyUrl);
      } else {
        setIsPostSurveyMissing(true);
      }
    },
  });

  // Auto-scroll main messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages triggers scroll, not consumed in body
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // The conversation clock is anchored server-side (see resolveStudyElapsedSeconds
  // in the API). We resume from the elapsed seconds the server reports and add our
  // own delta since connect, so refreshing the page no longer hands the participant
  // a fresh 8 minutes, and a wrong device clock cannot shift the countdown.
  useEffect(() => {
    if (!study) return;
    const baseSeconds = study.elapsedSecondsAtConnect ?? 0;
    const connectedAt = Date.now();
    const tick = () => {
      setElapsedSeconds(baseSeconds + Math.floor((Date.now() - connectedAt) / 1000));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [study]);

  useEffect(() => {
    if (!study || isRedirecting || finishMutation.isPending) return;
    if (elapsedSeconds >= study.hardStopSeconds && !isStreaming) {
      finishMutation.mutate({ sessionId, endType: 'hard_stop' });
    }
  }, [elapsedSeconds, finishMutation, isRedirecting, isStreaming, sessionId, study]);

  const activateRails = (value: string) => {
    if (!hasActivatedRails && value.trim().length > 0) {
      setHasActivatedRails(true);
    }
  };

  const handlePartnerDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setPartnerDraft(value);
    activateRails(value);
  };

  const handleSendPartner = () => {
    const content = partnerDraft.trim();
    if (!content || isInputDisabled) return;
    activateRails(content);
    sendMessage(content);
    setPartnerDraft('');
  };

  const handleSendCoach = () => {
    const content = coachDraft.trim();
    if (!content || isAsideStreaming || !coachEnabled) return;
    startAside(content);
    setCoachDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPartner();
    }
  };

  const handleCoachKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCoach();
    }
  };

  const mainMessages = messages.filter((m) => m.role !== 'coach');
  const coachMessages = messages.filter((m) => m.role === 'coach');
  const railsVisible = hasActivatedRails || mainMessages.length > 0;
  const shortName = getShortName(scenario);
  const isQuotaExhausted = quota?.exhausted === true;
  const coachEnabled = study?.coachEnabled !== false;
  const isStudySession = study?.source === 'qualtrics_prolific';
  const participantTurnCount = mainMessages.filter((m) => m.role === 'user').length;
  const canFinishStudy = !study || participantTurnCount >= study.minParticipantTurns;
  const showWrapSoon =
    !!study &&
    elapsedSeconds >= Math.max(0, study.softCapSeconds - 90) &&
    elapsedSeconds < study.softCapSeconds;
  const hardStopped = !!study && elapsedSeconds >= study.hardStopSeconds;

  const isInputDisabled = isStreaming || isQuotaExhausted || hardStopped;

  const handleFinish = (
    endType: 'participant_finish' | 'early_exit' | 'soft_cap' | 'hard_stop'
  ) => {
    if (!isStudySession || finishMutation.isPending || isRedirecting) return;
    finishMutation.mutate({ sessionId, endType });
  };

  if (isRedirecting) {
    return (
      <FullScreenMessage
        title="Taking you to the final survey..."
        message={
          isPostSurveyMissing ? (
            'The final survey link is not configured yet.'
          ) : fallbackSurveyUrl ? (
            <a className="underline" href={fallbackSurveyUrl}>
              Click here if you are not redirected.
            </a>
          ) : (
            'Preparing redirect.'
          )
        }
      />
    );
  }

  // Loading state
  if (status === 'connecting' && !scenario) {
    return (
      <FullScreenMessage
        message={
          <output aria-live="polite">
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-8 h-8 rounded-full border-2
                              border-[rgba(212,232,229,0.6)] border-t-[rgba(212,232,229,0.8)] animate-spin"
              />
              <p>Connecting...</p>
            </div>
          </output>
        }
      />
    );
  }

  // Error state
  if (status === 'error' && error && !error.recoverable) {
    return (
      <FullScreenMessage
        title="Connection Error"
        titleColor="text-[#991B1B] dark:text-[#FCA5A5]"
        message={error.message}
        action={
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-2.5 text-sm font-medium
                       bg-[rgba(212,232,229,0.6)] dark:bg-[rgba(212,232,229,0.15)]
                       text-[#1A1A1A] dark:text-[#EBEBEB]
                       hover:bg-[rgba(212,232,229,0.8)] transition-colors"
          >
            Refresh Page
          </button>
        }
      />
    );
  }

  const lappRailWidth = railsVisible ? 'xl:w-[335px]' : 'xl:w-0';
  const coachRailWidth = railsVisible && coachEnabled ? 'lg:w-[360px] xl:w-[420px]' : 'lg:w-0';
  const repliesRemaining = Math.max(0, (study?.minParticipantTurns ?? 8) - participantTurnCount);
  const surveyUnlocked = !isStudySession || canFinishStudy || repliesRemaining === 0;

  return (
    <div className="flex h-dvh flex-col bg-[#f6f5f0] text-[#24221d] dark:bg-[#11110f] dark:text-[#dedbd4]">
      <header className="flex items-center justify-between border-b border-[#ddd8cc] bg-[#fbfaf6]/95 px-6 py-4 dark:border-[#2b2925] dark:bg-[#151513]/95">
        <div className="flex min-w-0 items-center gap-5">
          {!isStudySession && (
            <button
              onClick={() => navigate('/')}
              className="rounded-full p-2 text-[#5f5a51] transition-colors hover:bg-[#ece8dc] dark:text-[#aaa59b] dark:hover:bg-[#24231f]"
              type="button"
              aria-label="Go back"
            >
              <ArrowLeftIcon />
            </button>
          )}
          <div className="flex min-w-0 items-baseline gap-4">
            <span className="font-semibold text-[#24221d] dark:text-[#f2efe7]">ConvoLab</span>
            <span className="hidden border-l border-[#d6d1c4] pl-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a857b] dark:border-[#34312c] dark:text-[#77736b] sm:inline">
              Practice
            </span>
            <span className="hidden h-5 border-l border-[#d6d1c4] dark:border-[#34312c] sm:block" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-2xl text-[#24221d] dark:text-[#f2efe7]">
                {shortName}
              </h1>
              {scenario?.name && (
                <p className="truncate text-sm text-[#6f6a61] dark:text-[#9a958c]">
                  {scenario.name.replace(shortName, '').replace(/^(\s*[-·]\s*)/, '')}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isStudySession && (
            <button
              type="button"
              onClick={() => handleFinish('early_exit')}
              disabled={finishMutation.isPending}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#6a655c] transition-colors hover:bg-[#ece8dc] disabled:opacity-50 dark:text-[#aaa59b] dark:hover:bg-[#24231f]"
            >
              End conversation early
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {isStudySession && showWrapSoon && (
        <div className="border-b border-[#ddd8cc] bg-[#fbfaf6] px-4 py-2 text-center text-sm text-[#6a655c] dark:border-[#2b2925] dark:bg-[#151513] dark:text-[#aaa59b]">
          Wrapping up soon. Finish your current thought when ready.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`hidden shrink-0 overflow-hidden border-r border-[#ddd8cc] bg-[#fbfaf6] transition-[width,opacity] duration-500 ease-out dark:border-[#2b2925] dark:bg-[#151513] xl:flex ${lappRailWidth} ${
            railsVisible ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden={!railsVisible}
        >
          <LappMetricsPanel
            lappScores={lappScores}
            variant={coachEnabled ? 'full' : 'explanation'}
          />
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            className={`flex-1 overflow-y-auto px-4 py-6 md:px-8 ${
              railsVisible ? 'pb-56' : 'pb-8'
            }`}
          >
            {mainMessages.length === 0 ? (
              <div
                className={`flex h-full items-center justify-center transition-all duration-500 ${
                  railsVisible ? '-translate-y-20 opacity-0' : 'translate-y-0 opacity-100'
                }`}
              >
                <div className="w-full max-w-3xl -translate-y-12 pb-52 text-center">
                  <h2 className="font-serif text-4xl text-[#2e2b25] dark:text-[#f2efe7]">
                    {shortName} is ready when you are.
                  </h2>
                  <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#726d64] dark:text-[#9d9890]">
                    Open with a question. Listen before you push.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-4xl">
                <MessageList
                  messages={mainMessages}
                  partnerName={scenario?.partnerPersona}
                  isStreaming={isStreaming}
                  lappScores={lappScores}
                  showTone={coachEnabled}
                />
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div
            className={`absolute left-0 right-0 hidden px-6 transition-all duration-500 ease-out md:block ${
              railsVisible
                ? 'border-t border-[#ddd8cc] bg-[#fbfaf6]/95 py-4 dark:border-[#2b2925] dark:bg-[#151513]/95'
                : 'pointer-events-none bg-transparent py-0'
            }`}
            style={{
              top: railsVisible ? 'calc(100% - 196px)' : '58%',
              transform: railsVisible ? 'translateY(0)' : 'translateY(-50%)',
            }}
          >
            <div className="mx-auto max-w-4xl">
              {isQuotaExhausted && (
                <p className="mb-3 rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2 text-sm text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[rgba(127,29,29,0.25)] dark:text-[#FCA5A5]">
                  Token quota exhausted. Start a new conversation with Quick chat or a larger quota
                  to keep replying to {shortName}.
                </p>
              )}
              <div
                className={`mb-3 flex items-center justify-between gap-3 text-sm text-[#77736b] transition-opacity duration-300 dark:text-[#8f8a82] ${
                  railsVisible ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <span>
                  {surveyUnlocked ? 'Survey unlocked' : `${repliesRemaining} replies left`}
                </span>
                {isStudySession && (
                  <button
                    type="button"
                    onClick={() =>
                      handleFinish(
                        hardStopped
                          ? 'hard_stop'
                          : elapsedSeconds >= (study?.softCapSeconds ?? Infinity)
                            ? 'soft_cap'
                            : 'participant_finish'
                      )
                    }
                    disabled={!surveyUnlocked || finishMutation.isPending || isStreaming}
                    className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      surveyUnlocked
                        ? 'bg-[#f8f5ec] text-[#24221d] shadow-sm hover:bg-white dark:bg-[#f2efe7] dark:text-[#151513] dark:hover:bg-white'
                        : 'border border-[#d8d3c8] text-[#6a655c] hover:bg-[#eeeae1] dark:border-[#34312c] dark:text-[#9d9890] dark:hover:bg-[#22211d]'
                    }`}
                  >
                    Continue to final survey
                  </button>
                )}
              </div>
              <div className="pointer-events-auto flex items-end gap-2 rounded-[22px] border border-[#d8d3c8] bg-[#f6f4ee] p-3 shadow-sm dark:border-[#34312c] dark:bg-[#1b1a17]">
                <textarea
                  ref={inputRef}
                  value={partnerDraft}
                  onChange={handlePartnerDraftChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isQuotaExhausted
                      ? 'Token quota exhausted'
                      : hardStopped
                        ? 'Conversation window ended'
                        : `Reply to ${shortName}...`
                  }
                  rows={1}
                  disabled={isInputDisabled}
                  className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-base text-[#24221d] outline-none placeholder:text-[#8c877d] disabled:opacity-50 dark:text-[#efece4] dark:placeholder:text-[#77736b]"
                />
                <button
                  type="button"
                  onClick={handleSendPartner}
                  disabled={isInputDisabled || !partnerDraft.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#24221d] text-white transition-colors hover:bg-[#3a362f] disabled:bg-[#e0ddd4] disabled:text-[#928d84] dark:bg-[#eeeae1] dark:text-[#151513] dark:hover:bg-white dark:disabled:bg-[#2d2b27] dark:disabled:text-[#77736b]"
                  aria-label={`Send reply to ${shortName}`}
                >
                  <SendIcon />
                </button>
              </div>
              {!isStudySession && (
                <div
                  className={`mt-4 flex flex-wrap justify-center gap-3 transition-opacity duration-300 ${
                    railsVisible ? 'hidden' : 'pointer-events-auto opacity-100'
                  }`}
                >
                  {OPENING_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        setPartnerDraft(prompt);
                        activateRails(prompt);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full border border-[#d8d3c8] px-5 py-2 text-sm text-[#6c675e] transition-colors hover:bg-[#eeeae1] dark:border-[#34312c] dark:text-[#aaa59b] dark:hover:bg-[#22211d]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
              <p className="pt-3 text-center text-xs text-[#8c877d] dark:text-[#77736b]">
                Enter to send · goes to {shortName}
              </p>
            </div>
          </div>

          <div className="md:hidden">
            <MobileMessageInput
              onSendPartner={(content) => {
                activateRails(content);
                sendMessage(content);
              }}
              onSendCoach={(content) => {
                if (coachEnabled) startAside(content);
              }}
              partnerName={shortName}
              disabled={isStreaming || isAsideStreaming || isQuotaExhausted || hardStopped}
              isInsightsOpen={false}
              coachEnabled={coachEnabled}
              onToggleInsights={() => {}}
              onInputFocus={() => {}}
              onInputBlur={() => {}}
              onInputChange={activateRails}
            />
          </div>
        </main>

        {coachEnabled && (
          <aside
            className={`hidden shrink-0 overflow-hidden border-l border-[#ddd8cc] bg-[#fbfaf6] transition-[width,opacity] duration-500 ease-out dark:border-[#2b2925] dark:bg-[#151513] lg:block ${coachRailWidth} ${
              railsVisible ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={!railsVisible}
          >
            <DesktopCoachPanel
              coachMessages={coachMessages}
              asideMessages={asideMessages}
              lappScores={lappScores}
              coachDraft={coachDraft}
              setCoachDraft={setCoachDraft}
              onCoachKeyDown={handleCoachKeyDown}
              onSendCoach={handleSendCoach}
              coachInputRef={coachInputRef}
              disabled={isAsideStreaming}
              partnerName={shortName}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
