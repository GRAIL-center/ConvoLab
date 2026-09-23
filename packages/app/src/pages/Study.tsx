import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTRPC } from '../api/trpc';

const VALID_TOPICS = [
  'Environment',
  'Freedom of speech',
  'Guns',
  'Healthcare',
  'Housing',
  'Immigration',
  'Taxes',
  'Pick your own topic',
] as const;

type StudyTopic = (typeof VALID_TOPICS)[number];
type BinaryParam = '0' | '1';

function isStudyTopic(value: string): value is StudyTopic {
  return (VALID_TOPICS as readonly string[]).includes(value);
}

function isBinaryParam(value: string): value is BinaryParam {
  return value === '0' || value === '1';
}

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

function StudyShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6f5f0] text-[#24221d] dark:bg-[#11110f] dark:text-[#f2efe7]">
      <header className="border-b border-[#ddd8cc] bg-[#fbfaf6]/95 px-6 py-5 backdrop-blur-sm dark:border-[#2b2925] dark:bg-[#151513]/95">
        <div className="mx-auto flex max-w-7xl items-center gap-5">
          <h1 className="text-xl font-semibold">ConvoLab</h1>
          <div className="h-7 w-px bg-[#d8d3c8] dark:bg-[#34312c]" />
          <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[#8a857b] dark:text-[#77736b]">
            Conversation
          </p>
        </div>
      </header>
      <main className="px-5 py-10 sm:px-8 lg:py-14">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function StatusPanel({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string | null;
  actionLabel?: string;
}) {
  return (
    <StudyShell>
      <div className="mx-auto max-w-lg rounded-2xl border border-[#d8d3c8] bg-[#fbfaf6] p-7 text-center shadow-sm dark:border-[#34312c] dark:bg-[#1b1a17]">
        <h2 className="font-serif text-3xl text-[#24221d] dark:text-[#f2efe7]">{title}</h2>
        <p className="mt-3 leading-7 text-[#6f6a61] dark:text-[#9d9890]">{message}</p>
        {actionHref && actionLabel && (
          <a
            href={actionHref}
            className="mt-6 inline-flex rounded-full bg-[#24221d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#3a362f] dark:bg-[#eeeae1] dark:text-[#151513] dark:hover:bg-white"
          >
            {actionLabel}
          </a>
        )}
      </div>
    </StudyShell>
  );
}

export function Study() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const trpc = useTRPC();

  const parsed = useMemo(() => {
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
    // Omitted means "whatever the server's default is", which is deliberately
    // not decided here; only an explicit value is sent.
    const partnerOpensRaw = getFirstSearchParam(searchParams, [
      'partnerOpens',
      'PartnerOpens',
      'partneropens',
    ]);
    const partnerOpens = partnerOpensRaw ? parsePartnerOpensParam(partnerOpensRaw) : undefined;

    if (!pid) return { ok: false as const, error: 'Missing participant ID.' };
    if (!isStudyTopic(topic)) return { ok: false as const, error: 'Missing or invalid topic.' };
    if (!isBinaryParam(condition)) {
      return { ok: false as const, error: 'Missing or invalid study condition.' };
    }
    if (!isBinaryParam(partner)) {
      return { ok: false as const, error: 'Missing or invalid partner assignment.' };
    }
    if (!isBinaryParam(ideology)) {
      return { ok: false as const, error: 'Missing or invalid partner ideology assignment.' };
    }
    // A typo'd flag must not quietly run the other variant: a session assigned
    // to the wrong arm is unrecoverable once the conversation has happened.
    if (partnerOpensRaw && !partnerOpens) {
      return { ok: false as const, error: 'Invalid partnerOpens value.' };
    }

    return {
      ok: true as const,
      input: { pid, topic, condition, partner, ideology, party, rid, owntopic, partnerOpens },
    };
  }, [searchParams]);

  const enterMutation = useMutation({
    ...trpc.study.enter.mutationOptions(),
  });

  useEffect(() => {
    if (parsed.ok && !enterMutation.isPending && !enterMutation.isSuccess && !enterMutation.isError) {
      enterMutation.mutate(parsed.input);
    }
  }, [enterMutation, parsed]);

  useEffect(() => {
    // alreadyCompleted means the server declined to start a second
    // conversation for this participant; there is nothing to open.
    if (enterMutation.data && !enterMutation.data.alreadyCompleted) {
      navigate(`/conversation/${enterMutation.data.sessionId}`, { replace: true });
    }
  }, [enterMutation.data, navigate]);

  if (!parsed.ok) {
    return (
      <StatusPanel
        title="Study link problem"
        message={`${parsed.error} Please return to the survey tab and use the study link there.`}
      />
    );
  }

  if (enterMutation.isError) {
    return (
      <StatusPanel
        title="Study setup problem"
        message="We could not start the conversation from this link. Please return to the survey tab and try again."
      />
    );
  }

  if (enterMutation.data?.alreadyCompleted) {
    return (
      <StatusPanel
        title="You have already had this conversation"
        message={
          enterMutation.data.postSurveyUrl
            ? 'Each participant has one conversation, so there is nothing more to do here. Continue to the final survey to finish the study.'
            : 'Each participant has one conversation, so there is nothing more to do here. Please return to the survey tab to finish the study.'
        }
        actionHref={enterMutation.data.postSurveyUrl}
        actionLabel="Continue to final survey"
      />
    );
  }

  if (enterMutation.data) {
    return (
      <StatusPanel
        title="ConvoLab Study"
        message="Opening your conversation..."
      />
    );
  }

  return (
    <StatusPanel
      title="ConvoLab Study"
      message="Preparing your assigned AI conversation..."
    />
  );
}
