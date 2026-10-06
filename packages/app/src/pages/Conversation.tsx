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
import { CoachPanel } from '../components/conversation/CoachPanel';
import { LappMetricsPanel } from '../components/conversation/LappMetricsPanel';
import { MessageList } from '../components/conversation/MessageList';
import { MobileMessageInput } from '../components/conversation/MobileMessageInput';
import { MobileSheet } from '../components/conversation/MobileSheet';
import { ConversationTour } from '../components/conversation/tour/ConversationTour';
import { ThemeToggle } from '../components/ThemeToggle';
import { useConversationSocket } from '../hooks/useConversationSocket';
import { useKeyboardViewportHeight } from '../hooks/useKeyboardViewportHeight';

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

const MetricsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-5 h-5"
    aria-hidden="true"
  >
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-6" />
    <path d="M22 20H2" />
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
// Regular-app starter chips only (study sessions never show them, see
// the isStudySession guard where they render). They have to OPEN a
// conversation, so each is a question a person could ask in the first ten
// seconds, about any topic. Hanna, 2 Oct 2026.
const OPENING_PROMPTS = [
  'What are your thoughts on the current administration?',
  'What political issue worries you most these days?',
  'Has anything in the news lately really gotten under your skin?',
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
  // The rail panel is still mounted (display:none) at narrow widths, so the
  // coach tab's copy needs its own ref. Sharing one would point the quick-prompt
  // focus at whichever textarea mounted last, which is the invisible one.
  const mobileCoachInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [partnerDraft, setPartnerDraft] = useState('');
  const [coachDraft, setCoachDraft] = useState('');
  const [hasActivatedRails, setHasActivatedRails] = useState(false);
  const [tourKeepsRails, setTourKeepsRails] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [fallbackSurveyUrl, setFallbackSurveyUrl] = useState<string | null>(null);
  const [isPostSurveyMissing, setIsPostSurveyMissing] = useState(false);
  // Below lg the coach rail is gone, so the main pane switches between the
  // partner conversation and the coach via tabs.
  const [mobileView, setMobileView] = useState<'partner' | 'coach'>('partner');
  const [isMetricsSheetOpen, setIsMetricsSheetOpen] = useState(false);
  const [seenCoachCount, setSeenCoachCount] = useState(0);
  const keyboardViewportHeight = useKeyboardViewportHeight();

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

  // The keyboard opening shrinks the message pane from the bottom, which would
  // hide the latest reply behind it. Keep the end of the thread in view while
  // typing.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const keepEndInView = () => {
      if (document.activeElement instanceof HTMLTextAreaElement) {
        messagesEndRef.current?.scrollIntoView({ block: 'end' });
      }
    };
    vv.addEventListener('resize', keepEndInView);
    return () => vv.removeEventListener('resize', keepEndInView);
  }, []);

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
  // "The participant has started" is no longer "there are messages": in the
  // partner-opens variant the transcript already holds the partner's opener
  // when the page loads. The rails and the scene-setting card key on the
  // participant's own first message, so a lone opener does not make the page
  // behave as though the conversation is under way.
  const hasParticipantMessage = mainMessages.some((m) => m.role === 'user');
  const railsVisible = hasActivatedRails || hasParticipantMessage || tourKeepsRails;
  // The composer floats in the middle of an empty pane and docks to the bottom
  // once there is something to read above it. A partner opener is something to
  // read, so it docks then even though the rails are still closed.
  const composerDocked = railsVisible || mainMessages.length > 0;
  const shortName = getShortName(scenario);
  const isQuotaExhausted = quota?.exhausted === true;
  const coachEnabled = study?.coachEnabled !== false;
  // Everything the coach has said: unprompted insights plus its answers to
  // asides. The participant's own questions are not news to them.
  const coachItemCount =
    coachMessages.length + asideMessages.filter((m) => m.role === 'coach').length;
  const unreadCoachCount = Math.max(0, coachItemCount - seenCoachCount);
  const isStudySession = study?.source === 'qualtrics_prolific';
  const participantTurnCount = mainMessages.filter((m) => m.role === 'user').length;
  const canFinishStudy = !study || participantTurnCount >= study.minParticipantTurns;
  // The soft cap used to be a countdown to the end. It now marks the point where
  // the participant may leave if they want to; the hard stop is the only limit
  // that actually ends the conversation, so that is what we warn ahead of.
  const pastSoftCap = !!study && elapsedSeconds >= study.softCapSeconds;
  const hardStopped = !!study && elapsedSeconds >= study.hardStopSeconds;
  const showWrapSoon =
    !!study && !hardStopped && elapsedSeconds >= Math.max(0, study.hardStopSeconds - 90);
  const showCanFinishNotice = pastSoftCap && !showWrapSoon && !hardStopped;

  const isInputDisabled = isStreaming || isQuotaExhausted || hardStopped;

  // While the coach tab is showing the participant is looking at the thread,
  // so new coach output arriving is already read.
  useEffect(() => {
    if (mobileView === 'coach') setSeenCoachCount(coachItemCount);
  }, [mobileView, coachItemCount]);

  // The rails come back at lg (coach) and xl (metrics). A coach tab or sheet
  // left open past that point would show the same panel twice on one screen.
  useEffect(() => {
    const coachRail = window.matchMedia('(min-width: 1024px)');
    const metricsRail = window.matchMedia('(min-width: 1280px)');
    const sync = () => {
      if (coachRail.matches) setMobileView('partner');
      if (metricsRail.matches) setIsMetricsSheetOpen(false);
    };
    sync();
    coachRail.addEventListener('change', sync);
    metricsRail.addEventListener('change', sync);
    return () => {
      coachRail.removeEventListener('change', sync);
      metricsRail.removeEventListener('change', sync);
    };
  }, []);

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
  const repliesRemaining = Math.max(0, (study?.minParticipantTurns ?? 6) - participantTurnCount);
  // Either enough turns or enough time is sufficient: a slow participant who has
  // not reached the turn minimum by the soft cap can still choose to finish.
  const surveyUnlocked = !isStudySession || canFinishStudy || pastSoftCap;

  return (
    <div
      className="flex h-dvh flex-col bg-[#f6f5f0] text-[#24221d] dark:bg-[#11110f] dark:text-[#dedbd4]"
      style={keyboardViewportHeight ? { height: keyboardViewportHeight } : undefined}
    >
      {/* Slim on phones so the keyboard leaves room for the conversation. */}
      <header className="flex shrink-0 items-center justify-between border-b border-[#ddd8cc] bg-[#fbfaf6]/95 px-3 py-1.5 dark:border-[#2b2925] dark:bg-[#151513]/95 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
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
          <div className="flex min-w-0 items-baseline gap-3 sm:gap-4">
            <span className="font-semibold text-[#24221d] dark:text-[#f2efe7]">ConvoLab</span>
            <span className="hidden border-l border-[#d6d1c4] pl-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8a857b] dark:border-[#34312c] dark:text-[#77736b] sm:inline">
              Practice
            </span>
            <span className="hidden h-5 border-l border-[#d6d1c4] dark:border-[#34312c] sm:block" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-lg text-[#24221d] dark:text-[#f2efe7] sm:text-2xl">
                {shortName}
              </h1>
              {scenario?.name && (
                <p className="hidden truncate text-sm text-[#6f6a61] dark:text-[#9a958c] sm:block">
                  {scenario.name.replace(shortName, '').replace(/^(\s*[-·]\s*)/, '')}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          {/* Hidden at exactly the width where the metrics rail takes over.

              Regular app only. The pilot is registered as desktop-only (PAP
              3.1) and study participants are gated below 1024px before they
              ever reach this page, so a study session must never be offered
              the narrow-screen coach tab or metrics sheet: that would be a
              different treatment surface from the registered one. */}
          {!isStudySession && railsVisible && (
            <button
              type="button"
              onClick={() => setIsMetricsSheetOpen(true)}
              aria-label="Open conversation progress"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#5f5a51] transition-colors hover:bg-[#ece8dc] dark:text-[#aaa59b] dark:hover:bg-[#24231f] xl:hidden"
            >
              <MetricsIcon />
            </button>
          )}
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

      {isStudySession && (showCanFinishNotice || showWrapSoon) && (
        <div className="border-b border-[#ddd8cc] bg-[#fbfaf6] px-4 py-2 text-center text-sm text-[#6a655c] dark:border-[#2b2925] dark:bg-[#151513] dark:text-[#aaa59b]">
          {showWrapSoon
            ? 'Wrapping up soon. Finish your current thought when ready.'
            : 'You can continue as long as you like, or head to the survey whenever you are ready.'}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside
          data-tour="lapp"
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

        <main data-tour="partner" className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Below lg there is no coach rail, so the pane switches between the
              partner and the coach. Partner-side elements are hidden rather
              than unmounted so drafts and scroll position survive a switch. */}
          {!isStudySession && railsVisible && coachEnabled && (
            <div
              role="tablist"
              aria-label="Conversation view"
              className="flex shrink-0 border-b border-[#ddd8cc] bg-[#fbfaf6] pt-2 dark:border-[#2b2925] dark:bg-[#151513] lg:hidden"
            >
              {(['partner', 'coach'] as const).map((view) => {
                const isActive = mobileView === view;
                const showUnread = view === 'coach' && !isActive && unreadCoachCount > 0;
                return (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={showUnread ? `Coach, ${unreadCoachCount} new` : undefined}
                    onClick={() => setMobileView(view)}
                    className={`-mb-px flex min-w-0 flex-1 justify-center border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-[#24221d] text-[#24221d] dark:border-[#f2efe7] dark:text-[#f2efe7]'
                        : 'border-transparent text-[#77736b] hover:text-[#24221d] dark:text-[#8f8a82] dark:hover:text-[#f2efe7]'
                    }`}
                  >
                    {/* The dot hangs off the label so it doesn't push the
                        text off-centre in its half. */}
                    <span className="relative min-w-0 truncate">
                      {view === 'partner' ? shortName : 'Coach'}
                    </span>
                    {showUnread && (
                      <span className="relative ml-2 -mr-[18px] flex h-2.5 w-2.5 shrink-0 self-center">
                        {/* Keyed on the count so the pulse replays for each new reply. */}
                        <span
                          key={unreadCoachCount}
                          className="coach-dot-pulse absolute inset-0 rounded-full bg-[#2563eb] dark:bg-[#60a5fa]"
                        />
                        <span className="absolute inset-0 rounded-full bg-[#2563eb] dark:bg-[#60a5fa]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {mobileView === 'coach' && (
            <div className="min-h-0 flex-1 lg:hidden">
              <CoachPanel
                coachMessages={coachMessages}
                asideMessages={asideMessages}
                lappScores={lappScores}
                coachDraft={coachDraft}
                setCoachDraft={setCoachDraft}
                onCoachKeyDown={handleCoachKeyDown}
                onSendCoach={handleSendCoach}
                coachInputRef={mobileCoachInputRef}
                disabled={isAsideStreaming}
                partnerName={shortName}
              />
            </div>
          )}

          <div
            className={`flex-1 overflow-y-auto px-4 py-6 md:px-8 ${
              composerDocked ? 'pb-8 md:pb-56' : 'pb-8'
            } ${mobileView === 'coach' ? 'max-lg:hidden' : ''}`}
          >
            {mainMessages.length === 0 ? (
              <div
                className={`flex h-full items-center justify-center transition-all duration-500 ${
                  railsVisible ? '-translate-y-20 opacity-0' : 'translate-y-0 opacity-100'
                }`}
              >
                <div className="w-full max-w-3xl text-center md:-translate-y-12 md:pb-52">
                  <h2 className="font-serif text-4xl text-[#2e2b25] dark:text-[#f2efe7]">
                    {scenario?.intro
                      ? scenario.intro.heading
                      : `${shortName} is ready when you are.`}
                  </h2>
                  <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[#726d64] dark:text-[#9d9890]">
                    {scenario?.intro
                      ? scenario.intro.body
                      : 'Open with a question. Listen before you push.'}
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
                {/* Partner-opens variant: the opener is already on screen but
                    the participant has not spoken, so the scene-setting card
                    still belongs here, under the bubble and above the input. */}
                {!hasParticipantMessage && scenario?.intro && (
                  <div className="mt-8 border-t border-[#e6e2d8] pt-8 text-center dark:border-[#2b2925]">
                    <h2 className="font-serif text-3xl text-[#2e2b25] dark:text-[#f2efe7]">
                      {scenario.intro.heading}
                    </h2>
                    <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-[#726d64] dark:text-[#9d9890]">
                      {scenario.intro.body}
                    </p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div
            className={`absolute left-0 right-0 hidden px-6 transition-all duration-500 ease-out md:block ${
              composerDocked
                ? 'border-t border-[#ddd8cc] bg-[#fbfaf6]/95 py-4 dark:border-[#2b2925] dark:bg-[#151513]/95'
                : 'pointer-events-none bg-transparent py-0'
            } ${mobileView === 'coach' ? 'max-lg:hidden' : ''}`}
            style={{
              top: composerDocked ? 'calc(100% - 196px)' : '58%',
              transform: composerDocked ? 'translateY(0)' : 'translateY(-50%)',
            }}
          >
            <div className="mx-auto max-w-4xl">
              {isQuotaExhausted && (
                <p className="mb-3 rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2 text-sm text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[rgba(127,29,29,0.25)] dark:text-[#FCA5A5]">
                  This conversation has reached its length limit. Start a new conversation to keep
                  practicing.
                </p>
              )}
              <div
                className={`mb-3 flex items-center justify-between gap-3 text-sm text-[#77736b] transition-opacity duration-300 dark:text-[#8f8a82] ${
                  composerDocked ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <span>
                  {surveyUnlocked
                    ? 'Finish whenever you are ready'
                    : `${repliesRemaining} replies left`}
                </span>
                {isStudySession && (
                  <button
                    type="button"
                    // Past the soft cap the button is a free choice, not a cap being
                    // enforced, so it always records participant_finish. hard_stop is
                    // recorded only by the automatic end-of-window effect above.
                    onClick={() => handleFinish('participant_finish')}
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
              <div
                data-tour="composer"
                className="pointer-events-auto flex items-end gap-2 rounded-[22px] border border-[#d8d3c8] bg-[#f6f4ee] p-3 shadow-sm dark:border-[#34312c] dark:bg-[#1b1a17]"
              >
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
                    composerDocked ? 'hidden' : 'pointer-events-auto opacity-100'
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

          <div className={mobileView === 'coach' ? 'hidden' : 'md:hidden'}>
            <MobileMessageInput
              onSendPartner={(content) => {
                activateRails(content);
                sendMessage(content);
              }}
              partnerName={shortName}
              disabled={isInputDisabled}
              onInputChange={activateRails}
            />
          </div>
        </main>

        {coachEnabled && (
          <aside
            data-tour="coach"
            className={`hidden shrink-0 overflow-hidden border-l border-[#ddd8cc] bg-[#fbfaf6] transition-[width,opacity] duration-500 ease-out dark:border-[#2b2925] dark:bg-[#151513] lg:block ${coachRailWidth} ${
              railsVisible ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={!railsVisible}
          >
            <CoachPanel
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
      {scenario && (
        <ConversationTour
          ready
          isStudySession={isStudySession}
          coachEnabled={coachEnabled}
          onKeepRailsOpen={() => setTourKeepsRails(true)}
        />
      )}

      {/* Regular app only, for the same reason as the header button above:
          the pilot is registered desktop-only, so a study participant must
          never see the metrics in a bottom sheet. */}
      <MobileSheet
        open={!isStudySession && isMetricsSheetOpen}
        onClose={() => setIsMetricsSheetOpen(false)}
        label="Conversation progress"
      >
        <LappMetricsPanel lappScores={lappScores} variant={coachEnabled ? 'full' : 'explanation'} />
      </MobileSheet>
    </div>
  );
}
