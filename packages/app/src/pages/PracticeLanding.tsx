import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import Recaptcha from '../components/Recaptcha';
import { ThemeToggle } from '../components/ThemeToggle';

interface Scenario {
  id: number | string;
  name: string;
  description: string | null;
  partnerPersona: string;
}

const PREVIEW_SCENARIOS: Scenario[] = [
  {
    id: 'preview-angry-uncle-thanksgiving',
    name: 'Angry Uncle',
    partnerPersona: 'Holiday table politics',
    description: 'Holiday table politics',
  },
  {
    id: 'preview-progressive-left-male',
    name: 'Marcus Johnson',
    partnerPersona: 'Progressive',
    description: 'Progressive',
  },
  {
    id: 'preview-progressive-left-female',
    name: 'Maya Johnson',
    partnerPersona: 'Progressive',
    description: 'Progressive',
  },
  {
    id: 'preview-populist-right-male',
    name: 'Max Briggs',
    partnerPersona: 'Right-populist',
    description: 'Right-populist',
  },
  {
    id: 'preview-populist-right-female',
    name: 'Megan Briggs',
    partnerPersona: 'Right-populist',
    description: 'Right-populist',
  },
  {
    id: 'preview-difficult-coworker',
    name: 'Defensive coworker',
    partnerPersona: 'Workplace feedback',
    description: 'Workplace feedback',
  },
];

const LAPP = [
  ['L', 'Listen', 'What actually matters to them'],
  ['A', 'Acknowledge', 'Validate something real'],
  ['P', 'Pivot', 'Ask for your turn'],
  ['P', 'Perspective', 'Share in first person'],
] as const;

const PENDING_SCENARIO_KEY = 'practicePendingScenarioId';

function shortRole(scenario: Scenario): string {
  const text = scenario.description?.trim() || scenario.partnerPersona?.trim() || '';
  if (text.length <= 42) return text;
  return `${text.slice(0, 39).trimEnd()}…`;
}

function isPreviewScenario(scenario: Scenario | null): boolean {
  return !scenario || String(scenario.id).startsWith('preview-');
}

function useLandingFonts() {
  useEffect(() => {
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap';
    document.head.append(preconnect1, preconnect2, stylesheet);
    return () => {
      preconnect1.remove();
      preconnect2.remove();
      stylesheet.remove();
    };
  }, []);
}

export function PracticeLanding() {
  useLandingFonts();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const trpc = useTRPC();
  const resumeAttempted = useRef(false);

  const [picking, setPicking] = useState(false);
  const [awaitingAuthChoice, setAwaitingAuthChoice] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ?? '';
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(
    recaptchaSiteKey ? null : 'local-dev'
  );

  const { data: authData } = useQuery(trpc.auth.me.queryOptions());
  const isSignedIn = Boolean(authData?.user && authData.user.role !== 'GUEST');

  const { data: scenarios, isError } = useQuery(trpc.scenario.list.queryOptions());
  const liveScenarios = (scenarios as Scenario[] | undefined) ?? [];
  // First screen always has something to show. Live start only unlocks when
  // real scenarios came back from the API (preview ids are not startable).
  const usingLiveScenarios = !isError && liveScenarios.length > 0;
  const displayScenarios = usingLiveScenarios ? liveScenarios : PREVIEW_SCENARIOS;
  const showPreviewBadge = !usingLiveScenarios;
  const canStartLive = usingLiveScenarios && !isPreviewScenario(selectedScenario);

  const startMutation = useMutation({
    ...trpc.practice.start.mutationOptions(),
    onSuccess: (data) => {
      sessionStorage.removeItem(PENDING_SCENARIO_KEY);
      navigate(`/conversation/${data.sessionId}`, { replace: true });
    },
  });

  const startWithScenario = (scenarioId: string | number, token: string) => {
    if (startMutation.isPending) return;
    startMutation.mutate({ scenarioId, recaptchaToken: token });
  };

  // After Google OAuth, land back here with ?resumePractice=1 and start the
  // conversation the visitor already picked.
  useEffect(() => {
    if (resumeAttempted.current) return;
    if (searchParams.get('resumePractice') !== '1') return;
    if (!recaptchaToken || startMutation.isPending) return;

    const pending = sessionStorage.getItem(PENDING_SCENARIO_KEY);
    resumeAttempted.current = true;
    setSearchParams({}, { replace: true });

    if (!pending) return;
    startMutation.mutate({ scenarioId: pending, recaptchaToken });
  }, [searchParams, recaptchaToken, setSearchParams, startMutation]);

  const handleContinueAsGuest = () => {
    if (!selectedScenario || !recaptchaToken || !canStartLive) return;
    startWithScenario(selectedScenario.id, recaptchaToken);
  };

  const handleSignIn = () => {
    if (!selectedScenario || !canStartLive) return;
    sessionStorage.setItem(PENDING_SCENARIO_KEY, String(selectedScenario.id));
    window.location.href = `/api/auth/google?next=${encodeURIComponent('/?resumePractice=1')}`;
  };

  const handleStartSignedIn = () => {
    if (!selectedScenario || !recaptchaToken || !canStartLive) return;
    startWithScenario(selectedScenario.id, recaptchaToken);
  };

  const goBackFromPicker = () => {
    if (awaitingAuthChoice) {
      setAwaitingAuthChoice(false);
      return;
    }
    setPicking(false);
    setSelectedScenario(null);
  };

  const primaryCtaLabel = startMutation.isPending
    ? 'Preparing…'
    : isSignedIn
      ? 'Start conversation'
      : awaitingAuthChoice
        ? null
        : 'Continue';

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#1a1916] antialiased [font-family:Inter,ui-sans-serif,system-ui,sans-serif] dark:bg-[#11110f] dark:text-[#f2efe7]">
      {!picking ? (
        <div className="flex min-h-screen flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-black/10 px-6 py-5 dark:border-white/10 sm:px-10">
            <div className="inline-flex items-center gap-3.5">
              <img src="/convolab-logo.svg" alt="" className="h-[26px] w-[26px]" />
              <span className="text-[1.05rem] font-semibold tracking-[-0.02em]">ConvoLab</span>
              <span className="h-4 w-px bg-black/15 dark:bg-white/15" aria-hidden="true" />
              <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#7a756c] dark:text-[#8f8a80]">
                Practice
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {showPreviewBadge ? (
                <span className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] text-[#7a756c] dark:border-white/10 dark:text-[#8f8a80]">
                  Preview
                </span>
              ) : null}
              {isSignedIn ? (
                <a
                  href="/home"
                  className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-medium text-[#7a756c] transition hover:border-black/20 hover:text-[#1a1916] dark:border-white/10 dark:text-[#8f8a80] dark:hover:border-white/20 dark:hover:text-[#f2efe7]"
                >
                  Your sessions
                </a>
              ) : (
                <a
                  href="/api/auth/google?next=%2Fhome"
                  className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-medium text-[#7a756c] transition hover:border-black/20 hover:text-[#1a1916] dark:border-white/10 dark:text-[#8f8a80] dark:hover:border-white/20 dark:hover:text-[#f2efe7]"
                >
                  Sign in
                </a>
              )}
              <ThemeToggle />
            </div>
          </header>

          <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center sm:px-10 sm:py-16">
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#7a756c] dark:text-[#8f8a80]">
              Cross-partisan conversation practice
            </p>
            <h1 className="mt-4 max-w-[15ch] font-[Newsreader,Georgia,serif] text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[1.08] tracking-[-0.025em] text-balance">
              Practice the conversation you keep avoiding.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[1.05rem] leading-relaxed text-[#4a4741] dark:text-[#c8c3b8]">
              Talk with an AI partner who genuinely disagrees with you, while a coach helps you stay
              in the conversation. The goal is not to win the argument.
            </p>

            <div className="mt-10 w-full max-w-[820px]">
              <p className="mb-3.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7a756c] dark:text-[#8f8a80]">
                Who you might meet
              </p>
              <div className="flex flex-wrap justify-center gap-2.5">
                {displayScenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="pointer-events-none min-w-[168px] select-none rounded-full border border-black/10 bg-black/[0.03] px-[18px] py-3 dark:border-white/10 dark:bg-white/[0.04]"
                    aria-hidden="true"
                  >
                    <div className="font-[Newsreader,Georgia,serif] text-[1.05rem] font-medium tracking-[-0.01em]">
                      {scenario.name}
                    </div>
                    <div className="mt-0.5 text-[0.75rem] text-[#7a756c] dark:text-[#8f8a80]">
                      {shortRole(scenario)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <section
              className="mt-10 w-full max-w-[760px] rounded-[20px] border border-black/10 bg-[#fffcf7] px-5 py-5 text-left dark:border-white/10 dark:bg-[#171612] sm:px-6"
              aria-label="What you’ll practice"
            >
              <p className="mb-4 font-[Newsreader,Georgia,serif] text-[1.15rem] font-medium text-[#4a4741] dark:text-[#c8c3b8]">
                Four moves. Listen, Acknowledge, Pivot, Perspective.
              </p>
              <ul className="grid list-none grid-cols-2 gap-x-5 gap-y-3.5 p-0 md:grid-cols-4">
                {LAPP.map(([letter, title, detail]) => (
                  <li key={`${letter}-${title}`} className="flex items-start gap-2.5">
                    <span className="font-[Newsreader,Georgia,serif] text-[1.55rem] font-medium leading-none text-[#6f8f89] dark:text-[#8fb5ae]">
                      {letter}
                    </span>
                    <span>
                      <span className="block text-[0.82rem] font-semibold">{title}</span>
                      <span className="mt-0.5 block text-[0.75rem] leading-snug text-[#7a756c] dark:text-[#8f8a80]">
                        {detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </main>

          <div className="flex flex-col items-center gap-3 px-6 pb-10">
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="rounded-full bg-[#171614] px-7 py-[15px] text-[0.95rem] font-semibold text-[#f7f5f0] transition hover:-translate-y-px hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171614] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f5f0] dark:bg-[#eeeae1] dark:text-[#151513] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f]"
            >
              Choose who to practice with
            </button>
            <p className="text-xs text-[#7a756c] dark:text-[#8f8a80]">
              About ten minutes. You can leave whenever you like.
            </p>
          </div>

          <footer className="border-t border-black/10 px-6 py-5 text-center text-xs text-[#7a756c] dark:border-white/10 dark:text-[#8f8a80]">
            A research project from the GRAIL center
          </footer>
        </div>
      ) : (
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-7 sm:px-10 sm:py-10">
          <div className="mb-8 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={goBackFromPicker}
              className="text-sm text-[#7a756c] transition hover:text-[#1a1916] focus:outline-none focus-visible:underline dark:text-[#8f8a80] dark:hover:text-[#f2efe7]"
            >
              Back
            </button>
            <div className="inline-flex items-center gap-2">
              <img src="/convolab-logo.svg" alt="" className="h-5 w-5" />
              <span className="text-sm font-semibold tracking-[-0.02em]">ConvoLab</span>
            </div>
            <ThemeToggle />
          </div>

          {awaitingAuthChoice && !isSignedIn ? (
            <div className="flex flex-1 flex-col items-center justify-center pb-16">
              <h2 className="text-center font-[Newsreader,Georgia,serif] text-[clamp(1.9rem,4vw,2.6rem)] font-medium tracking-[-0.02em]">
                How do you want to continue?
              </h2>
              <p className="mx-auto mt-2 max-w-md text-center text-sm text-[#7a756c] dark:text-[#8f8a80]">
                Practicing with{' '}
                <span className="font-medium text-[#1a1916] dark:text-[#f2efe7]">
                  {selectedScenario?.name}
                </span>
                . Sign in to keep your conversations, or continue as a guest.
              </p>

              <div className="mx-auto mt-8 flex w-full max-w-sm flex-col items-center gap-3">
                {recaptchaSiteKey ? <Recaptcha onChange={setRecaptchaToken} /> : null}
                <a
                  href={`/api/auth/google?next=${encodeURIComponent('/?resumePractice=1')}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSignIn();
                  }}
                  className="flex w-full items-center justify-center rounded-full bg-[#171614] px-7 py-[15px] text-[0.95rem] font-semibold text-[#f7f5f0] transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171614] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f5f0] dark:bg-[#eeeae1] dark:text-[#151513] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f]"
                >
                  Sign in
                </a>
                <button
                  type="button"
                  onClick={handleContinueAsGuest}
                  disabled={!recaptchaToken || startMutation.isPending || !canStartLive}
                  className="w-full rounded-full border border-black/15 bg-transparent px-7 py-[15px] text-[0.95rem] font-semibold text-[#1a1916] transition hover:border-black/25 hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171614] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f5f0] dark:border-white/15 dark:text-[#f2efe7] dark:hover:border-white/25 dark:hover:bg-white/[0.04] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f]"
                >
                  {startMutation.isPending ? 'Preparing…' : 'Continue as guest'}
                </button>
                {startMutation.isError ? (
                  <p className="text-sm text-[#a36b55]">Couldn’t start. Try again.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-center font-[Newsreader,Georgia,serif] text-[clamp(1.9rem,4vw,2.6rem)] font-medium tracking-[-0.02em]">
                Choose who to practice with
              </h2>
              <p className="mx-auto mt-2 max-w-md text-center text-sm text-[#7a756c] dark:text-[#8f8a80]">
                One partner. One conversation. You can leave anytime.
              </p>

              <div className="mx-auto mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
                {displayScenarios.map((scenario) => {
                  const isSelected = selectedScenario?.id === scenario.id;
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => setSelectedScenario(scenario)}
                      aria-pressed={isSelected}
                      className={`rounded-2xl border px-5 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171614] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f5f0] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f] ${
                        isSelected
                          ? 'border-[#171614] bg-black/[0.04] dark:border-[#eeeae1] dark:bg-white/[0.06]'
                          : 'border-black/10 bg-transparent hover:border-black/20 dark:border-white/10 dark:hover:border-white/20'
                      }`}
                    >
                      <div className="font-[Newsreader,Georgia,serif] text-[1.1rem] font-medium tracking-[-0.01em]">
                        {scenario.name}
                      </div>
                      <div className="mt-1 text-[0.85rem] text-[#7a756c] dark:text-[#8f8a80]">
                        {shortRole(scenario)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mx-auto mt-auto flex w-full max-w-sm flex-col items-center gap-3 pt-10">
                {selectedScenario && recaptchaSiteKey && isSignedIn ? (
                  <Recaptcha onChange={setRecaptchaToken} />
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedScenario || !canStartLive) return;
                    if (isSignedIn) {
                      handleStartSignedIn();
                      return;
                    }
                    setAwaitingAuthChoice(true);
                  }}
                  disabled={
                    !selectedScenario ||
                    startMutation.isPending ||
                    !canStartLive ||
                    (isSignedIn && !recaptchaToken)
                  }
                  className="w-full rounded-full bg-[#171614] px-7 py-[15px] text-[0.95rem] font-semibold text-[#f7f5f0] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171614] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f5f0] dark:bg-[#eeeae1] dark:text-[#151513] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f]"
                >
                  {primaryCtaLabel}
                </button>
                {!canStartLive ? (
                  <p className="text-center text-xs text-[#7a756c] dark:text-[#8f8a80]">
                    {showPreviewBadge
                      ? 'Waiting for live partners from the API. If this stays empty, restart Docker so the emulator can seed.'
                      : 'Select a partner to continue.'}
                  </p>
                ) : null}
                {startMutation.isError ? (
                  <p className="text-sm text-[#a36b55]">Couldn’t start. Try again.</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
