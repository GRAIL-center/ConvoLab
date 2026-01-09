import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { parseQuota } from '../../lib/quota.js';
import { generateToken } from '../../lib/tokens.js';
import { publicProcedure, router, staffProcedure } from '../procedures.js';

export const sessionRouter = router({
  /**
   * Start a new conversation session (staff+ only).
   * Creates an auto-assigned invitation and session in one step.
   *
   * Supports two modes:
   * 1. Predefined scenario: provide scenarioId
   * 2. Custom scenario: provide customDescription + elaborated prompts
   */
  startNew: staffProcedure
    .input(
      z
        .object({
          presetName: z.string(),
          // Option 1: Predefined scenario
          scenarioId: z.number().optional(),
          // Option 2: Custom scenario (provide elaborated result from preview)
          customDescription: z.string().min(10).max(2000).optional(),
          elaborated: z
            .object({
              name: z.string(),
              persona: z.string(),
              partnerPrompt: z.string(),
              coachPrompt: z.string(),
            })
            .optional(),
        })
        .refine((data) => data.scenarioId || (data.customDescription && data.elaborated), {
          message: 'Either scenarioId or customDescription+elaborated must be provided',
        })
    )
    .mutation(async ({ ctx, input }) => {
      // Get quota preset
      const preset = await ctx.prisma.quotaPreset.findUnique({
        where: { name: input.presetName },
      });

      if (!preset) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Quota preset not found' });
      }

      const quota = parseQuota(preset.quota);

      // Predefined scenario path
      if (input.scenarioId) {
        const scenario = await ctx.prisma.scenario.findUnique({
          where: { id: input.scenarioId },
          select: { id: true, name: true },
        });

        if (!scenario) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Scenario not found' });
        }

        const session = await ctx.prisma.$transaction(async (tx) => {
          const invitation = await tx.invitation.create({
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

          return tx.conversationSession.create({
            data: {
              scenarioId: scenario.id,
              userId: ctx.user.id,
              invitationId: invitation.id,
              status: 'ACTIVE',
            },
          });
        });

        return { sessionId: session.id };
      }

      // Custom scenario path
      const { customDescription, elaborated } = input;
      if (!customDescription || !elaborated) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Custom scenario requires description and elaborated prompts',
        });
      }

      const session = await ctx.prisma.$transaction(async (tx) => {
        const invitation = await tx.invitation.create({
          data: {
            token: generateToken(),
            label: `Staff quick-start: ${elaborated.name}`,
            allowCustomScenario: true,
            quota: { tokens: quota.tokens, label: preset.label },
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            createdById: ctx.user.id,
            linkedUserId: ctx.user.id,
            claimedAt: new Date(),
          },
        });

        return tx.conversationSession.create({
          data: {
            userId: ctx.user.id,
            invitationId: invitation.id,
            status: 'ACTIVE',
            customDescription,
            customScenarioName: elaborated.name,
            customPartnerPersona: elaborated.persona,
            customPartnerPrompt: elaborated.partnerPrompt,
            customCoachPrompt: elaborated.coachPrompt,
          },
        });
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
