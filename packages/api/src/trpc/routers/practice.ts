import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { createSession } from '../../data/sessions.js';
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
  recaptchaToken: z.string().min(1),
});

export const practiceRouter = router({
  start: publicProcedure.input(startInput).mutation(async ({ ctx, input }) => {
    const humanVerified = await verifyRecaptcha(input.recaptchaToken, ctx.req.log);
    if (!humanVerified) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Captcha verification failed.' });
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
    if (!userId) {
      const anonymousUser = await ctx.prisma.user.create({ data: { role: Role.GUEST } });
      userId = anonymousUser.id;
      ctx.req.session.set('userId', userId);
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

    return { sessionId };
  }),
});
