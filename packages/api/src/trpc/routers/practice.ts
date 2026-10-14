import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { createSession } from '../../data/sessions.js';
import { issueAuthToken } from '../../lib/authToken.js';
import { parseQuota } from '../../lib/quota.js';
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

const startInput = z.object({
  scenarioId: z.union([z.number().int().positive(), z.string().trim().min(1)]),
  // Required for anonymous visitors; signed-in accounts are exempt below.
  recaptchaToken: z.string().min(1).optional(),
});

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
      select: { id: true, name: true, slug: true, isActive: true },
    });
    if (!scenario || !scenario.isActive) {
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

    let userId = ctx.userId ?? undefined;
    // Plan 18, step 4: the native app cannot hold the cookie, so when it
    // creates a guest it also gets a bearer token back. The website never
    // sends the X-ConvoLab-Client header, so its responses do not change.
    let authToken: string | undefined;
    if (!userId) {
      const anonymousUser = await ctx.prisma.user.create({ data: { role: Role.GUEST } });
      userId = anonymousUser.id;
      ctx.req.session.set('userId', userId);
      if (ctx.req.headers['x-convolab-client'] === 'native') {
        authToken = issueAuthToken(anonymousUser.id, 'guest');
      }
    }

    const invitation = await ctx.prisma.invitation.create({
      data: {
        token: generateToken(),
        label: `Public practice: ${scenario.name}`,
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
  }),
});
