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
    <div className="flex min-h-screen flex-col bg-[#F8F8F8] dark:bg-[#1A1A1A]">
      <header className="border-b border-[rgba(200,220,210,0.5)] bg-[rgba(255,255,255,0.9)] px-4 py-4 backdrop-blur-sm dark:border-[rgba(255,255,255,0.07)] dark:bg-[rgba(30,30,30,0.95)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A] dark:text-[#EBEBEB]">
              ConvoLab Study
            </h1>
            <p className="mt-0.5 text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
              AI conversation setup
            </p>
          </div>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

function StatusPanel({ title, message }: { title: string; message: string }) {
  return (
    <StudyShell>
      <div className="mx-auto max-w-lg rounded-lg border border-[rgba(200,220,210,0.6)] bg-white p-6 text-center shadow-sm dark:border-[rgba(255,255,255,0.07)] dark:bg-[rgba(30,30,30,0.95)]">
        <h2 className="text-2xl font-semibold text-[#1A1A1A] dark:text-[#EBEBEB]">{title}</h2>
        <p className="mt-3 text-[#6B6B6B] dark:text-[#A0A0A0]">{message}</p>
      </div>
    </StudyShell>
  );
}

function StudyInfoPanel({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-lg border border-[rgba(200,220,210,0.6)] bg-white p-5 shadow-sm dark:border-[rgba(255,255,255,0.07)] dark:bg-[rgba(30,30,30,0.95)]">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6B6B6B] dark:text-[#A0A0A0]">
        {label}
      </p>
      <h2 className="mt-2 text-lg font-semibold text-[#1A1A1A] dark:text-[#EBEBEB]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#4A4A4A] dark:text-[#C9C9C9]">{body}</p>
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

    return {
      ok: true as const,
      input: { pid, topic, condition, partner, party, rid, owntopic },
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
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-[#6B6B6B] dark:text-[#A0A0A0]">
              Your conversation is ready
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-[#1A1A1A] dark:text-[#EBEBEB]">
              Talk with {assignment.partnerName}
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <StudyInfoPanel
              label="Topic"
              title={displayTopic}
              body="Your chat will focus on this topic. The AI partner has already been assigned for this study session."
            />
            <StudyInfoPanel
              label="Approach"
              title="LAPP"
              body="Use Listen, Acknowledge, Pivot, and Present: first show you understand the other view, then move into your own perspective clearly and respectfully."
            />
            <StudyInfoPanel
              label="AI partner"
              title={assignment.partnerName}
              body={assignment.partnerSummary}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/conversation/${assignment.sessionId}`, { replace: true })}
              className="rounded-full bg-[#1A1A1A] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#333] dark:bg-[#EBEBEB] dark:text-[#1A1A1A] dark:hover:bg-white"
            >
              Start conversation
            </button>
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
