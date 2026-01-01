import { TRPCError } from '@trpc/server';
import { z } from 'zod';
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
});
