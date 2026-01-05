import { publicProcedure, router } from '../procedures.js';

export const sessionRouter = router({
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
