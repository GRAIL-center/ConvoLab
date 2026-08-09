/**
 * Synthetic conversation generator for DQI training data.
 *
 * Drives the real partner/coach/LAPP pipeline (ConversationManager) with an
 * LLM-simulated participant, persisting full sessions to Firestore exactly as
 * the app would. Runs entirely locally against the Firestore emulator by
 * default; refuses to touch a real project unless explicitly overridden.
 *
 * Usage (emulator, real LLMs — needs API keys in .env):
 *   firebase emulators:start --only firestore     # terminal 1
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm -F @workspace/api synthetic -- --turns 4
 *
 * Offline smoke test (no keys, no emulator data you care about):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm -F @workspace/api synthetic -- --fake-llm
 *
 * Options:
 *   --conversations <n>     conversations to generate (default 1)
 *   --turns <n>             user turns per conversation (default 4)
 *   --scenario <slug>       reuse an existing scenario by slug
 *   --persona <text>        fixed persona text (overrides the sampled survey profile)
 *   --topic <name>          survey topic for the sampled profile (default: random of the 7)
 *   --user-model <model>    LLM for the simulated participant
 *   --partner-model <model> partner LLM for the CLI-owned synthetic scenario
 *   --coach-model <model>   coach LLM for the CLI-owned synthetic scenario
 *   --fake-llm              offline mode: all agents use the deterministic fake provider
 *   --pace-seconds <n>      sleep between turns (use ~30 on the Gemini free tier)
 *   --out <file.jsonl>      also write the generated sessions as JSONL
 *   --allow-real-firestore  skip the emulator guard (DANGER: writes to the real project)
 */

import fs from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { config } from 'dotenv';

// Load API keys from the repo-root .env (same pattern as llm/smoke-test.ts).
// Safe with the emulator guard: FIRESTORE_EMULATOR_HOST comes from the shell,
// not .env, and when set it overrides whatever project id .env names.
config({ path: resolve(import.meta.dirname, '../../../../.env') });

import { generateParticipantProfile, type ParticipantProfile } from './participantProfiles.js';

interface CliOptions {
  conversations: number;
  turns: number;
  scenarioSlug?: string;
  persona?: string;
  topic?: string;
  userModel: string;
  partnerModel?: string;
  coachModel?: string;
  fakeLlm: boolean;
  paceSeconds: number;
  out?: string;
  allowRealFirestore: boolean;
}

function parseCliArgs(): CliOptions {
  const { values } = parseArgs({
    // pnpm forwards a literal "--" separator; tolerate it instead of crashing
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      conversations: { type: 'string', default: '1' },
      turns: { type: 'string', default: '4' },
      scenario: { type: 'string' },
      persona: { type: 'string' },
      topic: { type: 'string' },
      'user-model': { type: 'string' },
      'partner-model': { type: 'string' },
      'coach-model': { type: 'string' },
      'fake-llm': { type: 'boolean', default: false },
      'pace-seconds': { type: 'string' },
      out: { type: 'string' },
      'allow-real-firestore': { type: 'boolean', default: false },
    },
  });
  const fakeLlm = values['fake-llm'] ?? false;
  return {
    conversations: Number(values.conversations),
    turns: Number(values.turns),
    scenarioSlug: values.scenario,
    persona: values.persona,
    topic: values.topic,
    userModel: values['user-model'] ?? (fakeLlm ? 'fake:participant' : 'google:gemini-2.5-flash'),
    partnerModel: values['partner-model'],
    coachModel: values['coach-model'],
    fakeLlm,
    paceSeconds: Number(values['pace-seconds'] ?? 0),
    out: values.out,
    allowRealFirestore: values['allow-real-firestore'] ?? false,
  };
}

/** Console-backed stand-in for the Fastify logger the pipeline expects. */
function makeLogger(verbose = true) {
  const log = (level: string) => (obj: unknown, msg?: string) => {
    if (!verbose && level === 'info') return;
    const text = typeof obj === 'string' ? obj : (msg ?? '');
    console.error(`[${level}] ${text}`);
  };
  const logger: Record<string, unknown> = {
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    debug: () => {},
    trace: () => {},
    fatal: log('fatal'),
    child: () => logger,
    level: 'info',
  };
  return logger;
}

type ServerEvent = { type: string; [key: string]: unknown };

/** Collects pipeline output in place of a real WebSocket. */
class EventCollector {
  events: ServerEvent[] = [];
  private waiters: Array<{
    predicate: (e: ServerEvent) => boolean;
    resolve: (e: ServerEvent | null) => void;
  }> = [];

  send = (data: string): void => {
    const event = JSON.parse(data) as ServerEvent;
    this.events.push(event);
    this.waiters = this.waiters.filter((w) => {
      if (w.predicate(event)) {
        w.resolve(event);
        return false;
      }
      return true;
    });
  };

  /** Resolve when an event matching `predicate` arrives (past or future), or null on timeout. */
  waitFor(predicate: (e: ServerEvent) => boolean, timeoutMs: number): Promise<ServerEvent | null> {
    const existing = this.events.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const waiter = { predicate, resolve };
      this.waiters.push(waiter);
      // Deliberately NOT unref'd: this timer can be the only referenced handle
      // while we wait (e.g. the coach lane drops an incomplete insight and never
      // emits coach:done). With unref, Node's event loop drains and the process
      // exits 0 mid-conversation without writing --out.
      setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(null);
      }, timeoutMs);
    });
  }
}

export interface SyntheticResult {
  sessionId: string;
  scenarioId: string | number;
  turns: number;
  lappScores: ServerEvent[];
  record: Record<string, unknown>;
}

export interface RunOptions {
  turns: number;
  /** Fixed persona text; when omitted, a survey-grounded profile is sampled */
  persona?: string;
  /** Preferred policy topic for the sampled profile (one of the 7 survey topics) */
  topic?: string;
  userModel: string;
  fakeLlm: boolean;
  scenarioSlug?: string;
  partnerModel?: string;
  coachModel?: string;
  /** Sleep between turns — needed to stay inside free-tier LLM rate limits */
  paceSeconds?: number;
  postExchangeTimeoutMs?: number;
}

/**
 * Generate one synthetic conversation through the real pipeline.
 * Assumes Firestore targeting (emulator vs real) was already decided by the caller.
 */
export async function runSyntheticConversation(opts: RunOptions): Promise<SyntheticResult> {
  // Imported lazily so the CLI can set env guards before any Firestore client exists
  const { prisma } = await import('@workspace/database');
  const { getSession, createSession } = await import('../data/sessions.js');
  const { completeSession } = await import('../data/atomic.js');
  const { ConversationManager } = await import('../ws/conversation.js');
  const { streamCompletion } = await import('../llm/registry.js');

  const postExchangeTimeoutMs = opts.postExchangeTimeoutMs ?? 30_000;

  // Scenario: reuse by slug, or create a synthetic one
  let scenario = opts.scenarioSlug
    ? await prisma.scenario.findUnique({ where: { slug: opts.scenarioSlug } as never })
    : null;
  if (opts.scenarioSlug && !scenario) {
    throw new Error(`Scenario with slug "${opts.scenarioSlug}" not found`);
  }
  if (!scenario) {
    const slug = `synthetic-${opts.fakeLlm ? 'fake' : 'llm'}`;
    const partnerModel =
      opts.partnerModel ?? (opts.fakeLlm ? 'fake:partner' : 'google:gemini-2.5-flash');
    const coachModel =
      opts.coachModel ?? (opts.fakeLlm ? 'fake:coach' : 'anthropic:claude-sonnet-5');
    scenario = await prisma.scenario.findUnique({ where: { slug } as never });
    if (scenario) {
      // The synthetic scenario is CLI-owned; keep its models in sync with the flags
      scenario = await prisma.scenario.update({
        where: { id: (scenario as { id: string | number }).id } as never,
        data: { partnerModel, coachModel, updatedAt: new Date() } as never,
      });
    } else {
      scenario = await prisma.scenario.create({
        data: {
          name: 'Synthetic: MAGA-aligned relative',
          description:
            'Auto-created by the synthetic CLI. Cross-partisan dialogue practice with a MAGA-aligned relative.',
          slug,
          partnerPersona: 'Your MAGA-aligned uncle from rural Indiana',
          partnerSystemPrompt: [
            'You are role-playing a MAGA-aligned uncle from rural Indiana talking with',
            'a liberal-leaning relative. You are skeptical of mainstream media and',
            'coastal experts, proud of your community, and quick to feel talked down',
            'to — but you love your relative and stay in the conversation.',
            'Reply in 1-3 conversational sentences.',
          ].join(' '),
          coachSystemPrompt:
            'You coach users on constructive cross-partisan conversations using the LAPP framework (Listen, Acknowledge, Pivot, Perspective).',
          partnerModel,
          coachModel,
          partnerUseWebSearch: false,
          coachUseWebSearch: false,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never,
      });
    }
  }

  const startedAt = new Date();
  const userId = `synthetic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = await createSession({
    userId,
    invitationId: null,
    scenarioId: (scenario as { id: string | number }).id,
    status: 'ACTIVE',
    startedAt,
  } as never);

  const session = await getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} vanished after creation`);
  (session as { messages?: unknown[] }).messages = [];
  (session as { invitation?: unknown }).invitation = null;

  const collector = new EventCollector();
  const manager = new ConversationManager(
    collector as never,
    prisma as never,
    session as never,
    makeLogger() as never
  );
  await manager.initialize();

  // Participant identity: explicit --persona text, or a sampled survey-grounded
  // profile (topic choice + 0-10 positions on the V10 policy-belief items)
  const profile: ParticipantProfile | null = opts.persona
    ? null
    : generateParticipantProfile(opts.topic);
  const personaText = opts.persona ?? profile!.personaText;
  if (profile) {
    console.error(`participant profile: ${profile.topic} (${profile.intensity})`);
  }

  // The simulated participant: its own turns are 'assistant', partner turns are 'user'
  const participantView: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let turn = 1; turn <= opts.turns; turn++) {
    if (turn > 1 && opts.paceSeconds) {
      await new Promise((resolve) => setTimeout(resolve, opts.paceSeconds! * 1000));
    }
    if (participantView.length === 0) {
      participantView.push({
        role: 'user',
        content:
          profile?.openingInstruction ??
          '(Open the conversation with your relative: bring up how the country is doing, in your own words.)',
      });
    }

    let userText = '';
    for await (const chunk of streamCompletion(opts.userModel, {
      systemPrompt: personaText,
      messages: participantView,
      maxTokens: 300,
    })) {
      if (chunk.type === 'delta' && chunk.content) userText += chunk.content;
      if (chunk.type === 'error' && chunk.error) throw new Error(chunk.error.message);
    }
    userText = userText.trim();
    if (!userText) throw new Error(`Participant model returned empty turn ${turn}`);

    const eventsBefore = collector.events.length;
    await manager.handleUserMessage(userText);

    const partnerDone = collector.events.slice(eventsBefore).find((e) => e.type === 'partner:done');
    if (!partnerDone) {
      const err = collector.events.slice(eventsBefore).find((e) => e.type === 'error');
      throw new Error(
        `Partner reply missing on turn ${turn}${err ? `: ${String(err.message)}` : ''}`
      );
    }

    participantView.push({ role: 'assistant', content: userText });
    participantView.push({ role: 'user', content: String(partnerDone.content) });

    // Coach + LAPP run fire-and-forget from turn 2 on; wait so writes land before we finish
    if (turn > 1) {
      const newEvents = (e: ServerEvent, type: string) =>
        e.type === type && collector.events.indexOf(e) >= eventsBefore;
      const [coach, score] = await Promise.all([
        collector.waitFor((e) => newEvents(e, 'coach:done'), postExchangeTimeoutMs),
        collector.waitFor((e) => newEvents(e, 'score:update'), postExchangeTimeoutMs),
      ]);
      if (!coach) console.error(`[warn] no coach:done within timeout on turn ${turn}`);
      if (!score) console.error(`[warn] no score:update within timeout on turn ${turn}`);
    }
  }

  const endedAt = new Date();
  await completeSession(sessionId, endedAt);

  const lappScores = collector.events.filter((e) => e.type === 'score:update');
  const record = await buildJsonlRecord(sessionId, scenario, startedAt, endedAt, profile);
  return {
    sessionId,
    scenarioId: (scenario as { id: string | number }).id,
    turns: opts.turns,
    lappScores,
    record,
  };
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return null;
}

/**
 * Read the persisted session back from Firestore and shape it like
 * export_transcripts*.py output, so DQI tooling can consume it directly.
 */
async function buildJsonlRecord(
  sessionId: string,
  scenario: unknown,
  startedAt: Date,
  endedAt: Date,
  profile: ParticipantProfile | null
): Promise<Record<string, unknown>> {
  const { getMessagesForSession } = await import('../data/messages.js');
  const { getLappScoresForSession } = await import('../data/lappScores.js');

  const sc = scenario as Record<string, unknown>;
  const messages = await getMessagesForSession(sessionId);
  const scores = await getLappScoresForSession(sessionId);
  const scoreByMessageId = new Map(scores.map((s) => [String(s.userMessageId), s]));

  const turns = messages.map((m) => {
    const t: Record<string, unknown> = {
      message_id: m.id,
      role: m.role,
      type: m.messageType ?? 'main',
      content: m.content,
      timestamp: toIso(m.timestamp),
    };
    const score = scoreByMessageId.get(String(m.id));
    if (score) {
      t.lapp = {
        turn: score.turnNumber,
        l: score.l,
        a: score.a,
        p: score.p,
        pe: score.pe,
        tone: score.tone,
      };
    }
    return t;
  });

  const nUserTurns = messages.filter(
    (m) => m.role === 'user' && (m.messageType ?? 'main') === 'main'
  ).length;

  return {
    session_id: sessionId,
    participant: 'synthetic',
    participant_profile: profile
      ? { topic: profile.topic, intensity: profile.intensity, positions: profile.positions }
      : undefined,
    scenario: sc.name,
    scenario_slug: sc.slug,
    partner_persona: sc.partnerPersona,
    partner_model: sc.partnerModel,
    coach_model: sc.coachModel,
    status: 'COMPLETED',
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_seconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    n_user_turns_main: nUserTurns,
    turns,
    synthetic: true,
  };
}

async function main(): Promise<void> {
  const opts = parseCliArgs();

  if (!process.env.FIRESTORE_EMULATOR_HOST && !opts.allowRealFirestore) {
    console.error(
      [
        'Refusing to run: FIRESTORE_EMULATOR_HOST is not set, so this would write',
        'synthetic conversations into the REAL Firestore project alongside',
        'participant data.',
        '',
        'Start the emulator and point at it:',
        '  firebase emulators:start --only firestore',
        '  FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm -F @workspace/api synthetic -- ...',
        '',
        'Or pass --allow-real-firestore if you truly mean to write to the real project.',
      ].join('\n')
    );
    process.exit(1);
  }

  if (!process.env.FIRESTORE_PROJECT_ID) {
    process.env.FIRESTORE_PROJECT_ID = 'convolab-synthetic';
  }
  if (opts.fakeLlm && !process.env.LAPP_SCORER_MODEL) {
    process.env.LAPP_SCORER_MODEL = 'fake:lapp-scorer';
  }

  const records: Record<string, unknown>[] = [];
  for (let i = 1; i <= opts.conversations; i++) {
    console.error(`--- conversation ${i}/${opts.conversations} ---`);
    const result = await runSyntheticConversation(opts);
    console.error(
      `session ${result.sessionId}: ${result.turns} user turns, ${result.lappScores.length} LAPP scores`
    );
    records.push(result.record);
  }

  if (opts.out) {
    fs.writeFileSync(opts.out, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
    console.error(`wrote ${records.length} records to ${opts.out}`);
  }
  console.error('done');
  process.exit(0);
}

const isDirectRun =
  process.argv[1]?.endsWith('synthetic.ts') || process.argv[1]?.endsWith('synthetic.js');
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
