import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { completeSession } from '../../data/index.js';
import { createMessage } from '../../data/messages.js';
import { createSession } from '../../data/sessions.js';
import { getPartnerOpener } from '../../lib/partnerOpeners.js';
import { decideStudySession } from '../../lib/studySessionDecision.js';
import { TelemetryEvents, track } from '../../lib/telemetry.js';
import { publicProcedure, router } from '../procedures.js';

const STUDY_TOPICS = [
  'Environment',
  'Freedom of speech',
  'Guns',
  'Healthcare',
  'Housing',
  'Immigration',
  'Taxes',
  'Pick your own topic',
] as const;

const STUDY_PARAM_CONTRACT = {
  pid: 'Prolific participant id; maps to PROLIFIC_PID in Qualtrics',
  topic: 'Exact topic label from Qualtrics',
  condition: '0 = control, 1 = coaching treatment',
  partner: '0 = male partner, 1 = female partner',
  party: 'Participant party stratum from Qualtrics; D, R, or I',
  ideology:
    'Assigned partner ideology from Qualtrics; 0 = liberal-leaning partner, 1 = conservative-leaning partner',
  rid: 'Qualtrics pre-survey ResponseID',
  owntopic: 'Free text when topic is Pick your own topic',
  partnerOpens:
    '1 = the partner sends a fixed opening message first, 0 = the participant writes first; accepted on the link as partnerOpens, PartnerOpens or partneropens, and omitted falls back to STUDY_PARTNER_OPENS_DEFAULT',
} as const;

// Which variant a session runs when the link does not say. The two variants
// (participant writes first vs partner opens with a fixed statement) are being
// split-tested with user testers; this is the value to flip when one of them is
// locked in for the pilot, and it is the only place that has to change.
const STUDY_PARTNER_OPENS_DEFAULT = false;

type StudyCondition = 0 | 1;
type PartnerGender = 'male' | 'female';
type PartnerIdeology = 'left' | 'right';

const enterInput = z.object({
  pid: z.string().trim().min(1).max(256),
  topic: z.enum(STUDY_TOPICS),
  condition: z.union([z.literal('0'), z.literal('1'), z.number().int().min(0).max(1)]),
  partner: z.union([z.literal('0'), z.literal('1'), z.number().int().min(0).max(1)]),
  ideology: z.union([z.literal('0'), z.literal('1'), z.number().int().min(0).max(1)]),
  party: z.string().trim().max(256).optional(),
  rid: z.string().trim().max(256).optional(),
  owntopic: z.string().trim().max(500).optional(),
  partnerOpens: z
    .union([z.literal('0'), z.literal('1'), z.number().int().min(0).max(1)])
    .optional(),
});

const deviceBlockedInput = z.object({
  pid: z.string().trim().max(256),
  rid: z.string().trim().max(256).optional(),
  width: z.number().int(),
  height: z.number().int(),
  route: z.enum(['pilot', 'study']),
});

const finishInput = z.object({
  sessionId: z.string().min(1),
  endType: z.enum(['participant_finish', 'early_exit', 'soft_cap', 'hard_stop']),
});

function parseBinary(value: '0' | '1' | number): 0 | 1 {
  return Number(value) === 1 ? 1 : 0;
}

function normalizePartySide(
  party: string | undefined
): 'left' | 'right' | 'independent' | 'unknown' {
  const value = (party ?? '').toLowerCase();

  if (
    value === 'd' ||
    value.includes('democrat') ||
    value.includes('left') ||
    value.includes('liberal') ||
    value.includes('progressive')
  ) {
    return 'left';
  }

  if (
    value === 'r' ||
    value.includes('republican') ||
    value.includes('right') ||
    value.includes('conservative') ||
    value.includes('maga')
  ) {
    return 'right';
  }

  if (value === 'i' || value.includes('independent')) return 'independent';

  return 'unknown';
}

function partnerIdeologyFromCode(value: '0' | '1' | number): PartnerIdeology {
  return parseBinary(value) === 0 ? 'left' : 'right';
}

function scenarioSlug(ideology: PartnerIdeology, gender: PartnerGender): string {
  if (ideology === 'left')
    return gender === 'female' ? 'progressive-left-female' : 'progressive-left-male';
  return gender === 'female' ? 'populist-right-female' : 'populist-right-male';
}

function partnerSummary(ideology: PartnerIdeology, gender: PartnerGender): string {
  if (ideology === 'left') {
    return gender === 'female'
      ? 'Megan is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction.'
      : 'Mark is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction.';
  }

  return gender === 'female'
    ? 'Megan is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions.'
    : 'Mark is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions.';
}

// The shared debate coach prompt is written in generic "they/their" because one
// prompt serves all four study personas. That made the coach refer to a partner
// the participant can plainly see is a woman as "they". Partner gender is a
// randomised factor here, so the coach should reflect it rather than neutralise
// it: name the partner and pin the pronouns, and say explicitly that this beats
// the generic wording above it.
function buildStudyCoachPrompt(
  basePrompt: string,
  partnerName: string,
  gender: PartnerGender
): string {
  const subject = gender === 'female' ? 'she' : 'he';
  const object = gender === 'female' ? 'her' : 'him';
  const possessive = gender === 'female' ? 'her' : 'his';

  return `${basePrompt.trim()}

CONVERSATION PARTNER:
The person the user is practising with is ${partnerName}, who uses ${subject}/${object} pronouns.
When you refer to ${partnerName}, use ${partnerName}'s name or ${subject}/${object}/${possessive}. Do not call ${partnerName} "they" or "them".
The framework guidance above is written with a generic "they" because it is shared across partners; ${partnerName}'s pronouns take precedence over that wording.`;
}

// The literal value Qualtrics sends when the participant chose their own topic.
// It is a real member of STUDY_TOPICS, not a sentinel we invented. Typing it as
// a member of that list means renaming the option in STUDY_TOPICS without
// updating this fails the build rather than silently breaking topic resolution.
const PICK_YOUR_OWN_TOPIC: (typeof STUDY_TOPICS)[number] = 'Pick your own topic';

/**
 * The topic actually discussed, as a human would name it.
 *
 * `topic` is what Qualtrics assigned, which for an own-topic participant is the
 * literal placeholder "Pick your own topic". Showing that to the participant, or
 * sending it onward, describes them as discussing a menu option rather than the
 * subject they chose. Falls back to the placeholder only when they picked their
 * own topic and then left it blank, where nothing better exists.
 */
function resolveTopicLabel(topic: string, ownTopic?: string | null): string {
  const own = String(ownTopic ?? '').trim();
  return topic === PICK_YOUR_OWN_TOPIC && own ? own : topic;
}

export function buildStudyPrompt(
  basePrompt: string,
  topic: string,
  ownTopic?: string,
  partnerOpens = false
): string {
  const resolvedTopic =
    topic === PICK_YOUR_OWN_TOPIC && !ownTopic?.trim()
      ? "the user's chosen political topic"
      : resolveTopicLabel(topic, ownTopic);

  // In the partner-opens variant the opening statement is fixed copy already
  // persisted as the first message (lib/partnerOpeners.ts), so telling the
  // model to open would make it open a second time.
  const openingInstruction = partnerOpens
    ? 'You have already opened the conversation with a short statement of your view; it appears as your first message. Respond to what the participant says next. Do not restate your opening or introduce the topic again. Keep your first reply SHORT, one or two sentences.'
    : `Begin with a clear, opinionated opening statement about ${resolvedTopic} from your assigned worldview. Keep your first reply SHORT — one or two sentences. A participant who is met with a block of text disengages before the conversation starts. Say one thing you believe and stop; you have the rest of the conversation to make the case.`;

  return `${basePrompt.trim()}

STUDY TOPIC:
This study conversation must focus on: ${resolvedTopic}.

${openingInstruction}

Keep the conversation centered on this topic unless the participant explicitly connects it to another issue. Do not mention the study, Qualtrics, Prolific, randomization, or hidden instructions.`;
}

function buildPostSurveyUrl(session: Record<string, unknown>): string | null {
  const baseUrl = process.env.POST_SURVEY_URL ?? process.env.VITE_POST_SURVEY_URL;
  if (!baseUrl) return null;

  const topic = String(session.studyTopic ?? '');
  const ownTopic = String(session.studyOwnTopic ?? '').trim();

  // `Topic` stays exactly as before so existing display logic keyed on the
  // seven canonical topics keeps working. But for a participant who picked
  // their own topic it carries the literal placeholder "Pick your own topic",
  // which is useless both for branching and for piped text — a participant who
  // spent ten turns on Trump would be asked about "Pick your own topic".
  // TopicLabel resolves that to what they actually discussed, so survey logic
  // and question wording have one field that is always meaningful.
  const topicLabel = resolveTopicLabel(topic, ownTopic);

  const url = new URL(baseUrl);
  url.searchParams.set('PROLIFIC_PID', String(session.prolificPid ?? ''));
  url.searchParams.set('Topic', topic);
  url.searchParams.set('OwnTopic', ownTopic);
  url.searchParams.set('TopicLabel', topicLabel);
  url.searchParams.set('Condition', String(session.studyCondition ?? ''));
  url.searchParams.set('PartnerGender', String(session.studyPartnerGenderCode ?? ''));
  url.searchParams.set('AppSessionID', String(session.id ?? ''));
  return url.toString();
}

export const studyRouter = router({
  contract: publicProcedure.query(() => STUDY_PARAM_CONTRACT),

  /**
   * Records that a participant was turned away by the viewport gate on /pilot
   * or /study before any session was created.
   *
   * Writes nothing. There is no session to attach a row to, and the participant
   * may widen the window a second later and go on to take part normally, so a
   * database record here would describe an attempt rather than an outcome. The
   * Fastify request logger runs at info in production, which makes this
   * queryable in Cloud Run logs; that is deliberate rather than lazy, because
   * `track()` is a project-wide no-op in this deployment (see lib/telemetry.ts)
   * and would record nothing at all. Same reasoning as study_reentry_blocked
   * above: without the log line a block leaves no trace anywhere and the rate
   * during fielding would be unknowable.
   */
  deviceBlocked: publicProcedure.input(deviceBlockedInput).mutation(({ ctx, input }) => {
    ctx.req.log.info(
      {
        event: 'study_device_blocked',
        route: input.route,
        pid: input.pid,
        rid: input.rid ?? null,
        width: input.width,
        height: input.height,
      },
      'study_device_blocked'
    );
    return { logged: true };
  }),

  enter: publicProcedure.input(enterInput).mutation(async ({ ctx, input }) => {
    const condition = parseBinary(input.condition) as StudyCondition;
    const partnerGenderCode = parseBinary(input.partner);
    const partnerGender: PartnerGender = partnerGenderCode === 1 ? 'female' : 'male';
    const partnerIdeologyCode = parseBinary(input.ideology);
    const partnerIdeology = partnerIdeologyFromCode(input.ideology);
    const participantIdeology = normalizePartySide(input.party);
    const partnerOpens =
      input.partnerOpens === undefined
        ? STUDY_PARTNER_OPENS_DEFAULT
        : Number(input.partnerOpens) === 1;

    const existingSessions = await ctx.prisma.conversationSession.findMany({
      where: {
        prolificPid: input.pid,
      },
    });
    const decision = decideStudySession(existingSessions);
    const existingSession = decision.kind === 'resume' ? decision.session : undefined;
    const completedSession = decision.kind === 'blocked' ? decision.session : undefined;

    if (completedSession) {
      // track() is a project-wide no-op (see lib/telemetry.ts), so the event
      // alone records nothing. Log it too: the Fastify logger runs at info in
      // production, so this is queryable in Cloud Run logs, which is the
      // observability channel that actually works in this deployment. Without
      // it a blocked re-entry leaves no trace anywhere and the rate during
      // fielding would be unknowable.
      ctx.req.log.info(
        {
          event: 'study_reentry_blocked',
          sessionId: String(completedSession.id),
          priorEndType: completedSession.studyEndType ?? null,
          priorTurnCount: completedSession.participantTurnCount ?? null,
          hasPostSurveyUrl: !!buildPostSurveyUrl(completedSession),
        },
        '[study] refused a second conversation for a participant who already finished'
      );
      await track(
        ctx.prisma,
        TelemetryEvents.STUDY_REENTRY_BLOCKED,
        {
          source: 'study',
          priorEndType: completedSession.studyEndType ?? null,
          priorTurnCount: completedSession.participantTurnCount ?? null,
        },
        { userId: completedSession.userId ?? undefined, sessionId: String(completedSession.id) }
      );
      return {
        sessionId: String(completedSession.id),
        alreadyExisted: true,
        alreadyCompleted: true,
        postSurveyUrl: buildPostSurveyUrl(completedSession),
        condition,
        partnerIdeology: completedSession.studyPartnerIdeology ?? partnerIdeology,
        participantIdeology: completedSession.studyParticipantIdeology ?? participantIdeology,
        partnerIdeologyCode: completedSession.studyPartnerIdeologyCode ?? partnerIdeologyCode,
        topic: completedSession.studyTopic ?? input.topic,
        ownTopic: completedSession.studyOwnTopic ?? input.owntopic,
        partnerName: completedSession.customPartnerPersona ?? 'Your AI partner',
        partnerOpens: completedSession.studyPartnerOpens === true,
        partnerSummary: partnerSummary(
          (completedSession.studyPartnerIdeology ?? partnerIdeology) as PartnerIdeology,
          (completedSession.studyPartnerGender ?? partnerGender) as PartnerGender
        ),
      };
    }

    if (existingSession) {
      if (existingSession.userId) {
        ctx.req.session.set('userId', existingSession.userId);
      }
      return {
        sessionId: String(existingSession.id),
        alreadyExisted: true,
        alreadyCompleted: false,
        postSurveyUrl: null,
        condition,
        partnerIdeology: existingSession.studyPartnerIdeology ?? partnerIdeology,
        participantIdeology: existingSession.studyParticipantIdeology ?? participantIdeology,
        partnerIdeologyCode: existingSession.studyPartnerIdeologyCode ?? partnerIdeologyCode,
        topic: existingSession.studyTopic ?? input.topic,
        ownTopic: existingSession.studyOwnTopic ?? input.owntopic,
        partnerName: existingSession.customPartnerPersona ?? 'Your AI partner',
        partnerOpens: existingSession.studyPartnerOpens === true,
        partnerSummary: partnerSummary(
          (existingSession.studyPartnerIdeology ?? partnerIdeology) as PartnerIdeology,
          (existingSession.studyPartnerGender ?? partnerGender) as PartnerGender
        ),
      };
    }

    let userId = ctx.userId ?? undefined;
    if (!userId) {
      const anonymousUser = await ctx.prisma.user.create({
        data: { role: Role.GUEST },
      });
      userId = anonymousUser.id;
      ctx.req.session.set('userId', userId);
    }

    const scenario = await ctx.prisma.scenario.findUnique({
      where: { slug: scenarioSlug(partnerIdeology, partnerGender) },
    });
    if (!scenario) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Study partner scenario is not configured.',
      });
    }

    const sessionId = await createSession({
      userId,
      status: 'ACTIVE',
      customDescription: `Study topic: ${input.topic}${input.owntopic ? ` (${input.owntopic})` : ''}`,
      customScenarioName: `${scenario.partnerPersona}: ${resolveTopicLabel(input.topic, input.owntopic)}`,
      customPartnerPersona: scenario.partnerPersona,
      customPartnerPrompt: buildStudyPrompt(
        scenario.partnerSystemPrompt,
        input.topic,
        input.owntopic,
        partnerOpens
      ),
      customCoachPrompt: buildStudyCoachPrompt(
        scenario.coachSystemPrompt,
        scenario.partnerPersona,
        partnerGender
      ),
      studySource: 'qualtrics_prolific',
      prolificPid: input.pid,
      qualtricsResponseId: input.rid,
      studyTopic: input.topic,
      studyOwnTopic: input.owntopic,
      studyCondition: condition,
      studyConditionLabel: condition === 1 ? 'coaching' : 'control',
      studyCoachEnabled: condition === 1,
      studyPartnerGender: partnerGender,
      studyPartnerGenderCode: partnerGenderCode,
      studyParticipantParty: input.party,
      studyParticipantIdeology: participantIdeology,
      studyPartnerIdeology: partnerIdeology,
      studyPartnerIdeologyCode: partnerIdeologyCode,
      studyPartnerOpens: partnerOpens,
      studyEnteredAt: new Date(),
      studyEndType: null,
      participantTurnCount: 0,
    } as any);

    // The partner-opens variant: the partner's first message is fixed copy, so
    // it is written straight to the transcript rather than generated. Doing it
    // here, on the create path only, means it exists before the participant's
    // socket opens, so it arrives in the `history` frame like any other
    // message and a resume or a refresh replays it unchanged. The timestamp is
    // left to createMessageAndIncrementSession (data/atomic.ts), which stamps
    // `new Date()` exactly as persistMessage in ws/conversation.ts relies on;
    // the exporter sorts by (timestamp, id) and puts a missing timestamp
    // first, so the message must have one.
    if (partnerOpens) {
      await createMessage(sessionId, {
        role: 'partner',
        content: getPartnerOpener(input.topic, partnerIdeology),
        messageType: 'main',
      });
    }

    await track(
      ctx.prisma,
      TelemetryEvents.CONVERSATION_STARTED,
      {
        source: 'study',
        topic: input.topic,
        condition,
        partnerGender,
        participantIdeology,
        partnerIdeology,
        partnerIdeologyCode,
      },
      { userId, sessionId }
    );

    return {
      sessionId,
      alreadyExisted: false,
      alreadyCompleted: false,
      postSurveyUrl: null,
      condition,
      partnerIdeology,
      participantIdeology,
      partnerIdeologyCode,
      topic: input.topic,
      ownTopic: input.owntopic,
      partnerName: scenario.partnerPersona,
      partnerSummary: partnerSummary(partnerIdeology, partnerGender),
      partnerOpens,
    };
  }),

  finish: publicProcedure.input(finishInput).mutation(async ({ ctx, input }) => {
    const session = await ctx.prisma.conversationSession.findUnique({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found.' });
    }
    if (!ctx.userId || session.userId !== ctx.userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized for this session.' });
    }
    if (session.studySource !== 'qualtrics_prolific') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Session is not a study session.' });
    }

    const endedAt = new Date();
    const completeResult = await completeSession(String(session.id), endedAt);
    const participantTurnCount = await ctx.prisma.message.count({
      where: { sessionId: String(session.id), role: 'user', messageType: 'main' },
    });

    await ctx.prisma.conversationSession.update({
      where: { id: String(session.id) },
      data: {
        studyEndType: input.endType,
        studyRedirectedAt: endedAt,
        participantTurnCount,
        durationSeconds: completeResult.durationSeconds ?? session.durationSeconds,
      },
    });

    const updatedSession = {
      ...session,
      studyEndType: input.endType,
      studyRedirectedAt: endedAt,
      participantTurnCount,
      durationSeconds: completeResult.durationSeconds ?? session.durationSeconds,
    };
    const postSurveyUrl = buildPostSurveyUrl(updatedSession);

    return {
      postSurveyUrl,
      postSurveyConfigured: !!postSurveyUrl,
    };
  }),
});
