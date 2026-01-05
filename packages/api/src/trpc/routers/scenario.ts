import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { elaborateDescription } from '../../lib/elaborate.js';
import { TelemetryEvents, track } from '../../lib/telemetry.js';
import { publicProcedure, router } from '../procedures.js';

export const scenarioRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const scenarios = await ctx.prisma.scenario.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        partnerPersona: true,
      },
      orderBy: { name: 'asc' },
    });
    return scenarios;
  }),

  get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const scenario = await ctx.prisma.scenario.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        partnerPersona: true,
      },
    });
    if (!scenario) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Scenario not found' });
    }
    return scenario;
  }),

  /**
   * Elaborate a user's description into full system prompts.
   * Used when claiming an invitation with allowCustomScenario=true.
   */
  elaborate: publicProcedure
    .input(
      z.object({
        description: z
          .string()
          .min(10, 'Description must be at least 10 characters')
          .max(2000, 'Description must be at most 2000 characters'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await elaborateDescription(input.description);

        // Track AI refusals for visibility into what users are trying
        if (!result.success) {
          await track(
            ctx.prisma,
            TelemetryEvents.AI_REFUSAL,
            {
              source: 'scenario_elaborate',
              refusalReason: result.refusalReason,
              // Truncate description for privacy but keep enough for debugging
              descriptionPreview: input.description.slice(0, 200),
            },
            { userId: ctx.userId ?? undefined }
          );
        }

        return result;
      } catch (error) {
        const err = error as Error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to elaborate scenario: ${err.message}`,
        });
      }
    }),
});
