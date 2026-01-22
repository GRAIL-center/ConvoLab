import { z } from 'zod';

import { publicProcedure, router } from '../procedures.js';

export const feedbackRouter = router({
  create: publicProcedure
    .input(
      z.object({
        sessionId: z.number().int().positive(),
        rating: z.number().int().min(1).max(5),
        message: z.string().max(2000).default(''),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, rating, message } = input;
      const userId = ctx.userId ?? null;

      const feedback = await ctx.prisma.feedback.create({
        data: {
          sessionId,
          rating,
          message,
          userId,
        },
      });

      return feedback;
    }),
});
