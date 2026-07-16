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
        comment: z.string().max(2000).optional()
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
      const items = docs.map(d => ({
        id: d.id,
        ...d.data(),
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
      const ratings = snapshot.docs.map(d => d.data().rating);
      const average = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of ratings) {
        if (r >= 1 && r <= 5) {
          distribution[r] += 1;
        }
      }
      return { total, average, distribution };
  }),
});
