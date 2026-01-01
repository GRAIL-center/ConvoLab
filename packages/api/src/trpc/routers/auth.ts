import { publicProcedure, router } from '../procedures.js';

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    const mergedFrom = ctx.req.session.get('mergedFrom') ?? null;

    // Clear the merge notification after reading (one-time notification)
    if (mergedFrom) {
      ctx.req.session.set('mergedFrom', undefined);
    }

    if (!ctx.userId) {
      return { user: null, mergedFrom: null };
    }

    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true,
        externalIdentities: {
          select: {
            provider: true,
            email: true,
          },
        },
        contactMethods: {
          select: {
            type: true,
            value: true,
            verified: true,
            primary: true,
          },
        },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
    });

    if (!user) {
      // User was deleted, clear session
      ctx.req.session.delete();
      return { user: null, mergedFrom: null };
    }

    // Flatten _count for cleaner API
    const { _count, ...userData } = user;
    return {
      user: { ...userData, sessionCount: _count.sessions },
      mergedFrom,
    };
  }),
});
