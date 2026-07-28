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

    // The shim doesn't support Prisma's nested relation `select` or the
    // `_count: { select: { sessions: true } }` shorthand, so fetch the
    // scalar user fields and the two relations as separate follow-up calls
    // instead of one nested select (same pattern used in auth/handlers.ts).
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true,
      },
    });

    if (!user) {
      // User was deleted, clear session
      ctx.req.session.delete();
      return { user: null, mergedFrom: null };
    }

    const [externalIdentities, contactMethods, sessionCount] = await Promise.all([
      ctx.prisma.externalIdentity.findMany({
        where: { userId: user.id },
        select: { provider: true, email: true },
      }),
      ctx.prisma.contactMethod.findMany({
        where: { userId: user.id },
        select: { type: true, value: true, verified: true, primary: true },
      }),
      ctx.prisma.conversationSession.count({ where: { userId: user.id } }),
    ]);

    return {
      user: { ...user, externalIdentities, contactMethods, sessionCount },
      mergedFrom,
    };
  }),
});
