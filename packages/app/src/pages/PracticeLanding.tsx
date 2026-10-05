import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import Recaptcha from '../components/Recaptcha';
import { ThemeToggle } from '../components/ThemeToggle';
import { PersonaPicker, type PracticeScenario } from './practice/PersonaPicker';
import { PracticeMarketing } from './practice/PracticeMarketing';

const PREVIEW_SCENARIOS: PracticeScenario[] = [
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

const PENDING_SCENARIO_KEY = 'practicePendingScenarioId';

function isPreviewScenario(scenario: PracticeScenario | null): boolean {
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

  const [selectedScenario, setSelectedScenario] = useState<PracticeScenario | null>(null);
  // The screen lives in the URL (?step=pick, ?step=auth) so the browser's own Back
  // button, and the Android back gesture, step back one screen instead of leaving
  // the site.
  const step = searchParams.get('step');
  const picking = step === 'pick' || step === 'auth';
  const awaitingAuthChoice = step === 'auth' && selectedScenario !== null;
  const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ?? '';
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(
    recaptchaSiteKey ? null : 'local-dev'
  );

  const { data: authData } = useQuery(trpc.auth.me.queryOptions());
  const isSignedIn = Boolean(authData?.user && authData.user.role !== 'GUEST');

  const {
    data: scenarios,
    isError,
    isPending: scenariosLoading,
    refetch: refetchScenarios,
  } = useQuery(trpc.scenario.list.queryOptions());
  const liveScenarios = (scenarios as PracticeScenario[] | undefined) ?? [];
  const usingLiveScenarios = !isError && liveScenarios.length > 0;
  // Stand-in partners are for local development only. In production a slow or
  // failed load shows a loading or error state, never partners nobody can pick.
  const isDev = import.meta.env.DEV;
  const displayScenarios = usingLiveScenarios ? liveScenarios : isDev ? PREVIEW_SCENARIOS : [];
  const showPreviewBadge = isDev && !usingLiveScenarios;
  const listStatus: 'ready' | 'loading' | 'error' = usingLiveScenarios
    ? 'ready'
    : scenariosLoading
      ? 'loading'
      : 'error';
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

  // Each screen swap should start at the top, not wherever the CTA was clicked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on screen changes only.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [picking, awaitingAuthChoice]);

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

  // Leaving the picker clears the choice; going back from the sign-in step keeps it.
  useEffect(() => {
    if (!picking) setSelectedScenario(null);
  }, [picking]);

  const goBackFromPicker = () => {
    // idx > 0 means an earlier entry in this app's history exists (the screen we
    // came from); on a direct load of ?step=... there is none, so replace instead.
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const primaryCtaLabel = startMutation.isPending
    ? 'Preparing…'
    : isSignedIn
      ? 'Start conversation'
      : 'Continue';

  return (
    <div className="min-h-screen bg-[#f7faf9] text-[#1a1916] antialiased [font-family:Inter,ui-sans-serif,system-ui,sans-serif] dark:bg-[#11110f] dark:text-[#f2efe7]">
      {!picking ? (
        <PracticeMarketing
          isSignedIn={isSignedIn}
          showPreviewBadge={showPreviewBadge}
          onChoosePartner={() => setSearchParams({ step: 'pick' })}
        />
      ) : awaitingAuthChoice && !isSignedIn ? (
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
                className="flex w-full items-center justify-center rounded-xl bg-[#328278] px-7 py-[15px] text-[0.95rem] font-semibold text-white transition hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#328278] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7faf9] dark:bg-[#eeeae1] dark:text-[#151513] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f]"
              >
                Sign in
              </a>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                disabled={!recaptchaToken || startMutation.isPending || !canStartLive}
                className="w-full rounded-xl border border-black/15 bg-transparent px-7 py-[15px] text-[0.95rem] font-semibold text-[#1a1916] transition hover:border-black/25 hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#328278] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7faf9] dark:border-white/15 dark:text-[#f2efe7] dark:hover:border-white/25 dark:hover:bg-white/[0.04] dark:focus-visible:ring-[#eeeae1] dark:focus-visible:ring-offset-[#11110f]"
              >
                {startMutation.isPending ? 'Preparing…' : 'Continue as guest'}
              </button>
              {startMutation.isError ? (
                <p className="text-sm text-[#a36b55]">Couldn’t start. Try again.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <PersonaPicker
          scenarios={displayScenarios}
          listStatus={listStatus}
          onRetry={() => refetchScenarios()}
          selectedScenario={selectedScenario}
          onSelect={setSelectedScenario}
          onBack={goBackFromPicker}
          onContinue={() => {
            if (!selectedScenario || !canStartLive) return;
            if (isSignedIn) {
              handleStartSignedIn();
              return;
            }
            setSearchParams({ step: 'auth' });
          }}
          canStartLive={canStartLive}
          showPreviewBadge={showPreviewBadge}
          isSignedIn={isSignedIn}
          isPending={startMutation.isPending}
          isError={startMutation.isError}
          primaryCtaLabel={primaryCtaLabel}
          recaptchaSiteKey={recaptchaSiteKey}
          onRecaptchaChange={setRecaptchaToken}
          recaptchaToken={recaptchaToken}
        />
      )}
    </div>
  );
}
