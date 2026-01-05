import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { parseQuota } from '../../lib/quota.js';
import { generateToken } from '../../lib/tokens.js';
import { publicProcedure, router, staffProcedure } from '../procedures.js';

export const sessionRouter = router({
  /**
   * Start a new conversation session (staff+ only).
   * Creates an auto-assigned invitation and session in one step.
   */
  startNew: staffProcedure
    .input(
      z.object({
        scenarioId: z.number(),
        presetName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify scenario exists
      const scenario = await ctx.prisma.scenario.findUnique({
        where: { id: input.scenarioId },
        select: { id: true, name: true },
      });

      if (!scenario) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Scenario not found' });
      }

      // Get quota preset
      const preset = await ctx.prisma.quotaPreset.findUnique({
        where: { name: input.presetName },
      });

      if (!preset) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Quota preset not found' });
      }

      const quota = parseQuota(preset.quota);

      // Create invitation (auto-assigned to current user)
      const invitation = await ctx.prisma.invitation.create({
        data: {
          token: generateToken(),
          label: `Staff quick-start: ${scenario.name}`,
          scenarioId: scenario.id,
          quota: { tokens: quota.tokens, label: preset.label },
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          createdById: ctx.user.id,
          linkedUserId: ctx.user.id,
          claimedAt: new Date(),
        },
      });

      // Create session
      const session = await ctx.prisma.conversationSession.create({
        data: {
          scenarioId: scenario.id,
          userId: ctx.user.id,
          invitationId: invitation.id,
          status: 'ACTIVE',
        },
      });

      return { sessionId: session.id };
    }),

  /**
   * List all conversation sessions for the current user.
   * Returns empty array if not authenticated.
   */
  listMine: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return [];

    const sessions = await ctx.prisma.conversationSession.findMany({
      where: { userId: ctx.userId },
      include: {
        scenario: {
          select: {
            id: true,
            name: true,
            partnerPersona: true,
          },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      scenario: s.scenario,
      status: s.status,
      messageCount: s._count.messages,
      startedAt: s.startedAt,
    }));
  }),
});
