import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import { useStudyViewportGate } from '../hooks/useStudyViewportGate';
import {
  isStudyViewportTooNarrow,
  STUDY_NARROW_VIEWPORT_BODY,
  STUDY_NARROW_VIEWPORT_TITLE,
} from '../lib/studyViewport';

const topicLabels = [
  'Environment',
  'Freedom of speech',
  'Guns',
  'Healthcare',
  'Housing',
  'Immigration',
  'Taxes',
  'Pick your own topic',
] as const;

type TopicLabel = (typeof topicLabels)[number];
type BinaryParam = '0' | '1';

const lappItems = [
  ['Listen', 'Understand what actually matters to the other person.'],
  ['Acknowledge', 'Name something real you can validate before responding.'],
  ['Pivot', 'Ask for your turn before making your point.'],
  ['Perspective', 'Share your view in first-person terms, not accusations.'],
] as const;

// Mirrors STUDY_PARTNER_OPENS_DEFAULT in packages/api/src/trpc/routers/study.ts.
// The server decides the variant; this copy only needs to describe it, so when
// the link says nothing both sides have to assume the same thing. Flip them
// together when the variant is locked in for the pilot.
const PARTNER_OPENS_DEFAULT = false;

// The partner-opens variant is set from the link, and the two variants are
// being split-tested by hand, so the link is written by a person as often as by
// Qualtrics. Accept the spellings a person actually types.
function parsePartnerOpensParam(value: string): BinaryParam | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true') return '1';
  if (normalized === '0' || normalized === 'false') return '0';
  return undefined;
}

function getFirstSearchParam(searchParams: URLSearchParams, names: string[]) {
  for (const name of names) {
    const value = searchParams.get(name)?.trim();
    if (value) return value;
  }
  return '';
}

function isTopicLabel(value: string): value is TopicLabel {
  return (topicLabels as readonly string[]).includes(value);
}

function isBinaryParam(value: string): value is BinaryParam {
  return value === '0' || value === '1';
}

function parseStudyParams(search: string) {
  const searchParams = new URLSearchParams(search);
  const rid = getFirstSearchParam(searchParams, ['rid', 'ResponseID', 'responseId']) || undefined;
  const pid =
    getFirstSearchParam(searchParams, ['pid', 'PROLIFIC_PID', 'prolific_pid']) ||
    (rid ? `qualtrics:${rid}` : '');
  const topic = getFirstSearchParam(searchParams, ['topic', 'Topic']);
  const condition = getFirstSearchParam(searchParams, ['condition', 'Condition']);
  const partner = getFirstSearchParam(searchParams, ['partner', 'PartnerGender']);
  const ideology = getFirstSearchParam(searchParams, ['ideology', 'PartnerIdeology']);
  const party = getFirstSearchParam(searchParams, ['party', 'Party']) || undefined;
  const owntopic = getFirstSearchParam(searchParams, ['owntopic', 'TopicOwn']) || undefined;
  // Omitted means "whatever the server's default is"; only an explicit value
  // is sent, so the default lives in one place.
  const partnerOpensRaw = getFirstSearchParam(searchParams, [
    'partnerOpens',
    'PartnerOpens',
    'partneropens',
  ]);
  const partnerOpens = partnerOpensRaw ? parsePartnerOpensParam(partnerOpensRaw) : undefined;

  if (!pid) return { ok: false as const, error: 'Missing participant ID.' };
  if (!isTopicLabel(topic)) return { ok: false as const, error: 'Missing or invalid topic.' };
  if (!isBinaryParam(condition)) {
    return { ok: false as const, error: 'Missing or invalid study condition.' };
  }
  if (!isBinaryParam(partner)) {
    return { ok: false as const, error: 'Missing or invalid partner assignment.' };
  }
  if (!isBinaryParam(ideology)) {
    return { ok: false as const, error: 'Missing or invalid partner ideology assignment.' };
  }
  // A typo'd flag must not quietly run the other variant: a session assigned to
  // the wrong arm is unrecoverable once the conversation has happened.
  if (partnerOpensRaw && !partnerOpens) {
    return { ok: false as const, error: 'Invalid partnerOpens value.' };
  }

  return {
    ok: true as const,
    input: { pid, topic, condition, partner, ideology, party, rid, owntopic, partnerOpens },
  };
}

function partnerPreview(ideologyCode: string, genderCode: string) {
  const isFemale = genderCode === '1';
  const isLeft = ideologyCode === '0';

  if (isLeft) {
    return {
      name: isFemale ? 'Megan' : 'Mark',
      label: 'Progressive conversation partner',
      body: isFemale
        ? 'Megan is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction.'
        : 'Mark is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction.',
    };
  }

  return {
    name: isFemale ? 'Megan' : 'Mark',
    label: 'Right-populist conversation partner',
    body: isFemale
      ? 'Megan is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions.'
      : 'Mark is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions.',
  };
}

// Shown instead of the landing page while the window is too narrow for the
// pilot as registered. It replaces the page rather than sitting on top of it
// because there is nothing useful to do here at this width, and it disappears
// on its own as soon as the window is wide enough.
function NarrowViewportNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#11110f] px-6 text-[#f2efe7]">
      <div className="w-full max-w-lg rounded-2xl border border-[#3a362f] bg-[#181714] p-7 text-center shadow-2xl">
        <img src="/convolab-logo.svg" alt="" className="mx-auto h-7 w-7" />
        <h1 className="mt-5 font-serif text-3xl leading-tight text-[#f2efe7]">
          {STUDY_NARROW_VIEWPORT_TITLE}
        </h1>
        <p className="mt-4 text-base leading-7 text-[#aaa59b]">{STUDY_NARROW_VIEWPORT_BODY}</p>
      </div>
    </div>
  );
}

export function PilotLanding() {
  const location = useLocation();
  const navigate = useNavigate();
  const trpc = useTRPC();
  // Set when the participant has already finished this conversation and came
  // back to the study link. The server refuses to start a second conversation
  // (see study.ts), so there is nothing to navigate to; point them onward to
  // the survey instead of silently doing nothing.
  const [completedPostSurveyUrl, setCompletedPostSurveyUrl] = useState<string | null | undefined>(
    undefined
  );
  const enterMutation = useMutation({
    ...trpc.study.enter.mutationOptions(),
    onSuccess: (data) => {
      if (data.alreadyCompleted) {
        setCompletedPostSurveyUrl(data.postSurveyUrl ?? null);
        return;
      }
      navigate(`/conversation/${data.sessionId}`, { replace: true });
    },
  });
  const alreadyCompleted = completedPostSurveyUrl !== undefined;

  const pageState = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    const topic = getFirstSearchParam(searchParams, ['topic', 'Topic']);
    const ownTopic = getFirstSearchParam(searchParams, ['owntopic', 'TopicOwn']);
    const partner = getFirstSearchParam(searchParams, ['partner', 'PartnerGender']);
    const ideology = getFirstSearchParam(searchParams, ['ideology', 'PartnerIdeology']);
    const condition = getFirstSearchParam(searchParams, ['condition', 'Condition']);
    const partnerOpens =
      parsePartnerOpensParam(
        getFirstSearchParam(searchParams, ['partnerOpens', 'PartnerOpens', 'partneropens'])
      ) ?? (PARTNER_OPENS_DEFAULT ? '1' : '0');
    const displayTopic =
      topic === 'Pick your own topic' && ownTopic
        ? ownTopic
        : topicLabels.includes(topic as TopicLabel)
          ? topic
          : 'your selected topic';

    return {
      displayTopic,
      hasCoach: condition === '1',
      partnerOpens: partnerOpens === '1',
      partner: partnerPreview(ideology, partner),
      parsed: parseStudyParams(location.search),
    };
  }, [location.search]);

  const viewportBlocked = useStudyViewportGate({
    route: 'pilot',
    pid: pageState.parsed.ok ? pageState.parsed.input.pid : undefined,
    rid: pageState.parsed.ok ? pageState.parsed.input.rid : undefined,
  });

  const handleStart = () => {
    if (!pageState.parsed.ok || enterMutation.isPending) return;
    // The resize check is debounced, so a window narrowed in the last fraction
    // of a second can still be showing the Start button. No session may be
    // created at a width the pilot is not registered for; the notice takes over
    // a moment later and explains why nothing happened.
    if (isStudyViewportTooNarrow()) return;
    enterMutation.mutate(pageState.parsed.input);
  };

  // Before any session exists, so a participant on a phone leaves no session
  // behind and can simply reopen the same link on a laptop.
  if (viewportBlocked) return <NarrowViewportNotice />;

  return (
    <div className="min-h-screen bg-[#11110f] text-[#f2efe7] lg:h-screen lg:overflow-hidden">
      <header className="border-b border-[#2b2925] bg-[#151513]/95 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-5">
          <img src="/convolab-logo.svg" alt="" className="h-7 w-7" />
          <h1 className="text-xl font-semibold">ConvoLab</h1>
          <div className="h-7 w-px bg-[#34312c]" />
          <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[#77736b]">
            Pilot Study
          </p>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-65px)] grid-cols-1 lg:h-[calc(100vh-65px)] lg:min-h-0 lg:grid-cols-[0.95fr_1fr]">
        <section className="flex flex-col justify-center border-b border-[#2b2925] px-6 py-6 sm:px-10 lg:min-h-0 lg:-translate-y-6 lg:border-b-0 lg:border-r lg:py-7">
          <div className="mx-auto w-full max-w-xl lg:max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#9d9890]">
              Conversation practice
            </p>
            <h2 className="font-serif text-4xl leading-[1.05] text-[#f2efe7] sm:text-5xl">
              Practice a conversation about {pageState.displayTopic}.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#aaa59b]">
              You will talk with your AI conversation partner, then continue to the final survey.
            </p>

            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-[#2b2925] bg-[#151513] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#77736b]">
                  You will talk with
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-[#f2efe7]">
                  {pageState.partner.name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-[#dedbd4]">
                  {pageState.partner.label}
                </p>
                <p className="mt-2 leading-6 text-[#aaa59b]">{pageState.partner.body}</p>
              </div>
            </div>

            {alreadyCompleted ? (
              <div className="mt-6 rounded-2xl border border-[#3a362f] bg-[#181714] p-6">
                <h3 className="text-lg font-semibold leading-7 text-[#f2efe7]">
                  You have already had this conversation.
                </h3>
                <p className="mt-2 text-base leading-7 text-[#aaa59b]">
                  Each participant has one conversation, so there is nothing more to do here.
                  {completedPostSurveyUrl
                    ? ' Continue to the final survey to finish the study.'
                    : ' Please return to the survey tab to finish the study.'}
                </p>
                {completedPostSurveyUrl && (
                  <a
                    href={completedPostSurveyUrl}
                    className="mt-5 inline-flex rounded-full bg-[#eeeae1] px-6 py-3.5 text-sm font-semibold text-[#151513] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#eeeae1] focus:ring-offset-2 focus:ring-offset-[#11110f]"
                  >
                    Continue to final survey
                  </a>
                )}
              </div>
            ) : (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!pageState.parsed.ok || enterMutation.isPending}
                  className="inline-flex rounded-full bg-[#eeeae1] px-6 py-3.5 text-sm font-semibold text-[#151513] shadow-[0_14px_32px_rgba(238,234,225,0.12)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-55 focus:outline-none focus:ring-2 focus:ring-[#eeeae1] focus:ring-offset-2 focus:ring-offset-[#11110f]"
                >
                  {enterMutation.isPending ? 'Preparing conversation...' : 'Start conversation'}
                </button>
                {!pageState.parsed.ok && (
                  <p className="mt-3 text-sm text-[#c9a18d]">
                    {pageState.parsed.error} Please return to the survey tab and use the study link
                    there.
                  </p>
                )}
                {enterMutation.isError && (
                  <p className="mt-3 text-sm text-[#c9a18d]">
                    We could not start the conversation from this link. Please try again.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="flex items-center justify-center bg-[#151513] px-4 py-8 sm:px-8 lg:min-h-0 lg:-translate-y-6 lg:py-6">
          <div className="w-full max-w-3xl space-y-3">
            {pageState.hasCoach && (
              <div className="rounded-2xl border border-[#3a362f] bg-[#181714] p-7 shadow-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#77736b]">
                  Conversation support
                </p>
                <h3 className="mt-4 text-lg font-semibold leading-7 text-[#f2efe7]">
                  A coach is available during the conversation.
                </h3>
                <p className="mt-2 text-base leading-7 text-[#aaa59b]">
                  A coach appears beside the conversation as soon as you start. From your{' '}
                  {pageState.partnerOpens ? 'first' : 'second'} message onward it will offer
                  feedback and suggestions. You can also ask it questions directly at any point.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-[#2b2925] bg-[#11110f] p-6 shadow-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#77736b]">
                Conversation framework
              </p>
              <p className="mt-4 max-w-2xl text-[16.5px] font-medium leading-7 text-[#c8c3b8]">
                Your goal isn’t to persuade {pageState.partner.name}. It’s to stay engaged through
                disagreement.
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {lappItems.map(([title, body]) => (
                  <div key={title}>
                    <p className="font-semibold text-[#dedbd4]">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#9d9890]">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
