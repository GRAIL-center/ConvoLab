import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { createSession } from '../../data/sessions.js';
import { issueAuthToken } from '../../lib/authToken.js';
import { requestAddress } from '../../lib/ipRateLimit.js';
import {
  decideGuestStart,
  GUEST_CONVERSATIONS_PER_COOKIE,
  PRACTICE_LIMIT_MESSAGES,
  type PracticeLimitDecision,
  releaseGuestPracticeStart,
  reserveAccountPracticeStart,
  reserveGuestPracticeStart,
} from '../../lib/practiceLimits.js';
import { isPublicScenario } from '../../lib/publicScenario.js';
import { getInvitationQuotaStatus, parseQuota } from '../../lib/quota.js';
import { verifyRecaptcha } from '../../lib/recaptcha.js';
import { TelemetryEvents, track } from '../../lib/telemetry.js';
import { generateToken } from '../../lib/tokens.js';
import { publicProcedure, router } from '../procedures.js';

// Public, no-login entry point for walk-up visitors (e.g. conference attendees)
// who are not part of the Prolific study and don't want to create an account.
// Deliberately writes no `study*`-prefixed fields onto the session: the RCT
// export (scripts/export_transcripts_firestore.py) includes a session in the
// study dataset purely based on the presence of `studySource`, so never
// writing it is what keeps these sessions out of the study pipeline.
const PRACTICE_PRESET_NAME = 'public-practice';
const PRACTICE_INVITATION_PREFIX = 'Public practice:';

const startInput = z.object({
  scenarioId: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  // Required for anonymous visitors; signed-in accounts are exempt below.
  recaptchaToken: z.string().min(1).optional(),
});

function refuse(decision: Extract<PracticeLimitDecision, { kind: 'refuse' }>): never {
  throw new TRPCError({
    code: decision.reason === 'guest_allowance_spent' ? 'FORBIDDEN' : 'TOO_MANY_REQUESTS',
    message: decision.message,
  });
}

export const practiceRouter = router({
  start: publicProcedure.input(startInput).mutation(async ({ ctx, input }) => {
    // The captcha gates anonymous abuse of the public model-backed endpoint.
    // A signed-in account (any role above GUEST) has already identified
    // itself through Google, so it is not asked to prove humanity again --
    // being sent back to a captcha right after signing in was the complaint
    // that motivated this (14 Oct 2026).
    const signedInUser = ctx.userId
      ? await ctx.prisma.user.findUnique({ where: { id: ctx.userId }, select: { role: true } })
      : null;
    const isSignedInAccount = !!signedInUser && signedInUser.role !== Role.GUEST;
    if (!isSignedInAccount) {
      const humanVerified = input.recaptchaToken
        ? await verifyRecaptcha(input.recaptchaToken, ctx.req.log)
        : false;
      if (!humanVerified) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Captcha verification failed.' });
      }
    }

    const scenario = await ctx.prisma.scenario.findUnique({
      where: { id: input.scenarioId } as { id: string | number },
      select: { id: true, name: true, slug: true, isActive: true, audience: true },
    });
    // Draft and pilot scenarios stay off the public practice flow. A known id
    // must not start one from the landing page while it is withheld.
    if (!scenario || !scenario.isActive || !isPublicScenario(scenario.audience)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Scenario not found' });
    }

    const preset = await ctx.prisma.quotaPreset.findUnique({
      where: { name: PRACTICE_PRESET_NAME },
    });
    if (!preset) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Practice preset not configured',
      });
    }
    const quota = parseQuota(preset.quota);

    // A cookie or token can outlive its user (account deletion, #242, on
    // another device): only reuse the id if the user still exists.
    let userId = signedInUser ? (ctx.userId ?? undefined) : undefined;
    // Plan 18, step 4: the native app cannot hold the cookie, so when it
    // creates a guest it also gets a bearer token back. The website never
    // sends the X-ConvoLab-Client header, so its responses do not change.
    let authToken: string | undefined;
    // Track a bumped guest start so a later failure can hand it back (#277).
    let guestStartAddress: string | undefined;
    let guestStartReserved = false;

    if (isSignedInAccount && userId) {
      const decision = await reserveAccountPracticeStart(ctx.firestore, userId);
      if (decision.kind === 'refuse') refuse(decision);
    } else {
      // Guest cookie: pressing Start on a partner they already have an open
      // chat with reopens that chat; otherwise it counts against the five.
      if (userId) {
        const invitations = await ctx.prisma.invitation.findMany({
          where: { linkedUserId: userId },
        });
        const practiceInvitations = invitations.filter(
          (inv: { label?: string | null }) =>
            typeof inv.label === 'string' && inv.label.startsWith(PRACTICE_INVITATION_PREFIX)
        );

        if (practiceInvitations.length > 0) {
          const invitationById = new Map(
            practiceInvitations.map((inv: { id: string }) => [String(inv.id), inv])
          );
          const sessions = await ctx.prisma.conversationSession.findMany({
            where: { userId },
          });
          const practiceSessions = (
            sessions as Array<{
              id: string | number;
              invitationId?: string | null;
              scenarioId?: string | number | null;
              status?: string | null;
              startedAt?: unknown;
            }>
          )
            .filter((s) => s.invitationId && invitationById.has(String(s.invitationId)))
            .sort((a, b) => {
              const at = a.startedAt ? new Date(String(a.startedAt)).getTime() : 0;
              const bt = b.startedAt ? new Date(String(b.startedAt)).getTime() : 0;
              return bt - at;
            });

          // Reopen only the latest ACTIVE chat for the same scenario the guest
          // is starting now. A 600k-token chat almost never runs dry, so
          // matching on allowance alone trapped a guest on their first partner
          // (Hanna, PR #277). A different partner, or a finished chat, starts
          // fresh and counts against the five.
          const resumable = practiceSessions.find(
            (s) =>
              String(s.scenarioId) === String(scenario.id) && (s.status ?? 'ACTIVE') === 'ACTIVE'
          );
          if (resumable) {
            const invitation = invitationById.get(String(resumable.invitationId)) as
              | { id: string; quota?: unknown }
              | undefined;
            const invitationQuota = invitation ? parseQuota(invitation.quota) : quota;
            const status = invitation
              ? await getInvitationQuotaStatus(ctx.prisma, String(invitation.id), invitationQuota)
              : { remaining: 0 };
            const decision = decideGuestStart({
              practiceSessionCount: practiceSessions.length,
              existingSessionId: String(resumable.id),
              allowanceRemaining: status.remaining,
              // Day/IP are checked inside reserveGuestPracticeStart when we mint a new one.
              guestDayStarts: 0,
              ipHourStarts: 0,
              ipDayStarts: 0,
            });
            if (decision.kind === 'refuse') refuse(decision);
            if (decision.kind === 'reopen') {
              return { sessionId: decision.sessionId, authToken };
            }
            // allow_new: this chat is spent and they still have free slots left.
          } else if (practiceSessions.length >= GUEST_CONVERSATIONS_PER_COOKIE) {
            // No reopenable chat for this partner, and the five are already
            // used up: ask them to sign in rather than minting a sixth.
            refuse({
              kind: 'refuse',
              reason: 'guest_allowance_spent',
              message: PRACTICE_LIMIT_MESSAGES.guestAllowanceSpent,
            });
          }
        }
      }

      // New guest conversation (first cookie, or next of the five after spending one).
      guestStartAddress = requestAddress(ctx.req);
      const decision = await reserveGuestPracticeStart(ctx.firestore, guestStartAddress);
      if (decision.kind === 'refuse') refuse(decision);
      guestStartReserved = true;

      if (!userId) {
        const anonymousUser = await ctx.prisma.user.create({ data: { role: Role.GUEST } });
        userId = anonymousUser.id;
        ctx.req.session.set('userId', userId);
        ctx.req.log.info({ event: 'guest_created', userId, source: 'practice' }, 'guest created');
        if (ctx.req.headers['x-convolab-client'] === 'native') {
          authToken = issueAuthToken(anonymousUser.id, 'guest');
        }
      }
    }

    if (!userId) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Missing user for practice start',
      });
    }

    // From here on a bumped guest counter must be handed back if we fail before
    // the session exists, or a crash mid-start would silently burn a start.
    try {
      const invitation = await ctx.prisma.invitation.create({
        data: {
          token: generateToken(),
          label: `${PRACTICE_INVITATION_PREFIX} ${scenario.name}`,
          scenarioId: scenario.id,
          quota: { tokens: quota.tokens, label: preset.label },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          linkedUserId: userId,
          claimedAt: new Date(),
          // No createdById -- no authenticated staff user initiated this.
        },
      });

      const sessionId = await createSession({
        scenarioId: scenario.id,
        userId,
        invitationId: invitation.id,
        status: 'ACTIVE',
      } as Parameters<typeof createSession>[0]);

      await track(
        ctx.prisma,
        TelemetryEvents.CONVERSATION_STARTED,
        {
          scenarioId: scenario.id,
          scenarioSlug: scenario.slug,
          isCustom: false,
          source: 'public_practice',
        },
        { userId, sessionId }
      );

      return { sessionId, authToken };
    } catch (err) {
      if (guestStartReserved && guestStartAddress) {
        await releaseGuestPracticeStart(ctx.firestore, guestStartAddress).catch(() => {
          // Best effort: the counters self-heal on the next UTC rollover, so a
          // failed refund must not mask the original error.
        });
      }
      throw err;
    }
  }),
});
