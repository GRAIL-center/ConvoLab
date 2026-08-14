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

function StatusPanel({ title, message }: { title: string; message: string }) {
  return (
    <StudyShell>
      <div className="mx-auto max-w-lg rounded-2xl border border-[#d8d3c8] bg-[#fbfaf6] p-7 text-center shadow-sm dark:border-[#34312c] dark:bg-[#1b1a17]">
        <h2 className="font-serif text-3xl text-[#24221d] dark:text-[#f2efe7]">{title}</h2>
        <p className="mt-3 leading-7 text-[#6f6a61] dark:text-[#9d9890]">{message}</p>
      </div>
    </StudyShell>
  );
}

function StudyInfoPanel({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-[#d8d3c8] bg-[#fbfaf6] p-6 dark:border-[#34312c] dark:bg-[#1b1a17]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#77736b] dark:text-[#8c8880]">
        {label}
      </p>
      <h2 className="mt-3 text-xl font-semibold text-[#24221d] dark:text-[#dedbd4]">{title}</h2>
      <p className="mt-3 leading-7 text-[#6f6a61] dark:text-[#9d9890]">{body}</p>
    </section>
  );
}

function LappBrief() {
  const items = [
    ['Listen', 'Understand what actually matters to them.'],
    ['Acknowledge', 'Name something real you can validate.'],
    ['Pivot', 'Ask for your turn before making your point.'],
    ['Perspective', 'Share your view in “I” statements, not accusations.'],
  ] as const;

  return (
    <section className="rounded-2xl border border-[#d8d3c8] bg-[#fbfaf6] p-6 dark:border-[#34312c] dark:bg-[#1b1a17]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#77736b] dark:text-[#8c8880]">
        What LAPP Means
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {items.map(([title, body]) => (
          <div key={title}>
            <p className="font-semibold text-[#24221d] dark:text-[#dedbd4]">{title}</p>
            <p className="mt-1 text-sm leading-6 text-[#6f6a61] dark:text-[#9d9890]">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Study() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const trpc = useTRPC();

  const parsed = useMemo(() => {
    const pid = searchParams.get('pid')?.trim() ?? '';
    const topic = searchParams.get('topic')?.trim() ?? '';
    const condition = searchParams.get('condition')?.trim() ?? '';
    const partner = searchParams.get('partner')?.trim() ?? '';
    const ideology = searchParams.get('ideology')?.trim() ?? '';
    const party = searchParams.get('party')?.trim() || undefined;
    const rid = searchParams.get('rid')?.trim() || undefined;
    const owntopic = searchParams.get('owntopic')?.trim() || undefined;

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

    return {
      ok: true as const,
      input: { pid, topic, condition, partner, ideology, party, rid, owntopic },
    };
  }, [searchParams]);

  const enterMutation = useMutation({
    ...trpc.study.enter.mutationOptions(),
  });

  useEffect(() => {
    if (parsed.ok && !enterMutation.isPending && !enterMutation.isSuccess) {
      enterMutation.mutate(parsed.input);
    }
  }, [enterMutation, parsed]);

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

  if (enterMutation.data) {
    const assignment = enterMutation.data;
    const displayTopic =
      assignment.topic === 'Pick your own topic' && assignment.ownTopic
        ? assignment.ownTopic
        : assignment.topic;

    return (
      <StudyShell>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8a857b] dark:text-[#77736b]">
              Your conversation is ready
            </p>
            <h2 className="mt-5 font-serif text-5xl leading-tight text-[#24221d] dark:text-[#f2efe7] sm:text-6xl">
              Talk with {assignment.partnerName}.
            </h2>
            <p className="mt-6 text-lg leading-8 text-[#6f6a61] dark:text-[#aaa59b]">
              You will have a focused conversation about {displayTopic}. Read the notes here, then
              start when you are ready.
            </p>
            <div className="mt-9">
              <button
                type="button"
                onClick={() => navigate(`/conversation/${assignment.sessionId}`, { replace: true })}
                className="rounded-full bg-[#24221d] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3a362f] dark:bg-[#eeeae1] dark:text-[#151513] dark:hover:bg-white"
              >
                Start conversation
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <StudyInfoPanel
                label="Topic"
                title={displayTopic}
                body="Your conversation will focus on this topic."
              />
              <StudyInfoPanel
                label="AI partner"
                title={assignment.partnerName}
                body={assignment.partnerSummary}
              />
            </div>
            <LappBrief />
          </div>
        </div>
      </StudyShell>
    );
  }

  return (
    <StatusPanel
      title="ConvoLab Study"
      message="Preparing your assigned AI conversation..."
    />
  );
}
