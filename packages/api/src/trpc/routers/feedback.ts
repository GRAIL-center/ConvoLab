import { z } from 'zod';
import { adminProcedure, publicProcedure, router } from '../procedures.js';

export const feedbackRouter = router({
  /**
   * Submit feedback. Open to all (anonymous + authenticated).
   * If a user session exists, the feedback is associated with the user.
   */
  submit: publicProcedure
    .input(
      z.object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trimmed = input.comment?.trim();
      await ctx.prisma.feedback.create({
        data: {
          rating: input.rating,
          comment: trimmed && trimmed.length > 0 ? trimmed : null,
          userId: ctx.userId ?? null,
        },
      });
      return { success: true };
    }),

  /**
   * List feedback entries for the admin dashboard.
   */
  list: adminProcedure
    .input(
      z
        .object({
          cursor: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .default({ limit: 50 })
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit } = input;

      const rows = await ctx.prisma.feedback.findMany({
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (rows.length > limit) {
        const next = rows.pop();
        nextCursor = next?.id;
      }

      const items = rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: r.user,
      }));

      return { items, nextCursor };
    }),

  /**
   * Aggregate stats for the admin dashboard header.
   */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [total, ratings] = await Promise.all([
      ctx.prisma.feedback.count(),
      ctx.prisma.feedback.findMany({ select: { rating: true } }),
    ]);

    const average =
      ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0;

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const r of ratings) {
      if (r.rating >= 1 && r.rating <= 5) {
        distribution[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
      }
    }

    return { total, average, distribution };
  }),
});
