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
        recaptchaToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trimmed = input.comment?.trim();

      const docRef = ctx.firestore.collection('feedback').doc();
      await docRef.set({
        rating: input.rating,
        comment: trimmed && trimmed.length > 0 ? trimmed : null,
        userId: ctx.userId ?? null,
        createdAt: new Date().toISOString(),
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

      let query = ctx.firestore.collection('feedback').orderBy('createdAt', 'desc');
      if (cursor) {
        const cursorDoc = await ctx.firestore.collection('feedback').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }
      const snapshot = await query.limit(limit + 1).get();
      const docs = snapshot.docs;
      let nextCursor: string | undefined;
      if (docs.length > limit) {
        const nextDoc = docs.pop();
        nextCursor = nextDoc?.id;
      }
      const rawItems = docs.map((d) => {
        const data = d.data() as {
          rating?: unknown;
          comment?: unknown;
          userId?: unknown;
          createdAt?: unknown;
        };
        return {
          id: d.id,
          rating: typeof data.rating === 'number' ? data.rating : 0,
          comment: typeof data.comment === 'string' ? data.comment : null,
          userId: typeof data.userId === 'string' ? data.userId : null,
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date(0).toISOString(),
        };
      });
      const userIds = [
        ...new Set(rawItems.map((item) => item.userId).filter((id): id is string => !!id)),
      ];
      const users = await Promise.all(
        userIds.map((id) =>
          ctx.prisma.user.findUnique({
            where: { id },
            select: { id: true, name: true, avatarUrl: true, role: true },
          })
        )
      );
      const userById = new Map(users.filter(Boolean).map((user: any) => [String(user.id), user]));
      const items = rawItems.map((item) => ({
        ...item,
        user: item.userId ? (userById.get(item.userId) ?? null) : null,
      }));
      return { items, nextCursor };
    }),

  /**
   * Aggregate stats for the admin dashboard header.
   */
  stats: adminProcedure.query(async ({ ctx }) => {
      const feedbackCol = ctx.firestore.collection('feedback');
      const snapshot = await feedbackCol.get();
      const total = snapshot.size;
      const ratings = snapshot.docs
        .map((d) => d.data().rating)
        .filter((r): r is number => typeof r === 'number');
      const average = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;
      const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of ratings) {
        if (r >= 1 && r <= 5) {
          distribution[r as 1 | 2 | 3 | 4 | 5] += 1;
        }
      }
      return { total, average, distribution };
  }),
});
