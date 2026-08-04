import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { track } from '../../lib/telemetry.js';
import { adminProcedure, router } from '../procedures.js';

export const userRouter = router({
  /**
   * List all users with pagination and filtering.
   */
  list: adminProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        roleFilter: z.enum(['GUEST', 'USER', 'STAFF', 'ADMIN']).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit, roleFilter, search } = input;

      let users = await ctx.prisma.user.findMany({
        where: roleFilter ? { role: roleFilter } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      const userIds = users.map((u: any) => u.id);
      const [externalIdentities, sessions] = await Promise.all([
        userIds.length
          ? ctx.prisma.externalIdentity.findMany({
              where: { userId: { in: userIds } },
              select: { userId: true, provider: true, email: true },
            })
          : Promise.resolve([]),
        userIds.length
          ? ctx.prisma.conversationSession.findMany({
              where: { userId: { in: userIds } },
              select: { id: true, userId: true },
            })
          : Promise.resolve([]),
      ]);

      const identitiesByUserId = new Map<string, any[]>();
      for (const identity of externalIdentities as any[]) {
        const current = identitiesByUserId.get(identity.userId) ?? [];
        current.push(identity);
        identitiesByUserId.set(identity.userId, current);
      }

      const sessionCountByUserId = new Map<string, number>();
      for (const session of sessions as any[]) {
        sessionCountByUserId.set(session.userId, (sessionCountByUserId.get(session.userId) ?? 0) + 1);
      }

      if (search) {
        const normalizedSearch = search.toLowerCase();
        users = users.filter((u: any) => {
          const nameMatches =
            typeof u.name === 'string' && u.name.toLowerCase().includes(normalizedSearch);
          const emailMatches = (identitiesByUserId.get(u.id) ?? []).some(
            (identity) =>
              typeof identity.email === 'string' &&
              identity.email.toLowerCase().includes(normalizedSearch)
          );
          return nameMatches || emailMatches;
        });
      }

      if (cursor) {
        const cursorIndex = users.findIndex((u: any) => u.id === cursor);
        if (cursorIndex >= 0) {
          users = users.slice(cursorIndex + 1);
        }
      }

      users = users.slice(0, limit + 1);

      let nextCursor: string | undefined;
      if (users.length > limit) {
        const nextItem = users.pop();
        nextCursor = nextItem?.id;
      }

      return {
        users: users.map((u: any) => {
          const identities = identitiesByUserId.get(u.id) ?? [];
          return {
            id: u.id,
            name: u.name,
            avatarUrl: u.avatarUrl,
            role: u.role,
            createdAt: u.createdAt,
            lastLoginAt: u.lastLoginAt,
            sessionCount: sessionCountByUserId.get(u.id) ?? 0,
            email: identities[0]?.email ?? null,
            provider: identities[0]?.provider ?? null,
            hasIdentity: identities.length > 0,
          };
        }),
        nextCursor,
      };
    }),

  /**
   * Get a single user with full details.
   */
  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: input.id },
    });

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const [externalIdentities, sessions, invitationsLinked, invitationsCreatedCount] =
      await Promise.all([
        ctx.prisma.externalIdentity.findMany({
          where: { userId: input.id },
          select: { id: true, provider: true, email: true, createdAt: true },
        }),
        ctx.prisma.conversationSession.findMany({
          where: { userId: input.id },
          orderBy: { startedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            startedAt: true,
            totalMessages: true,
            scenarioId: true,
          },
        }),
        ctx.prisma.invitation.findMany({
          where: { linkedUserId: input.id, claimedAt: { not: null } },
          take: 5,
          select: {
            id: true,
            token: true,
            label: true,
            claimedAt: true,
            scenarioId: true,
          },
        }),
        ctx.prisma.invitation.count({ where: { createdById: input.id } }),
      ]);

    const scenarioIds = [
      ...new Set(
        [...sessions, ...invitationsLinked]
          .map((item: any) => item.scenarioId)
          .filter((id): id is string | number => id !== undefined && id !== null)
          .map(String)
      ),
    ];
    const scenarios = await Promise.all(
      scenarioIds.map((id) => ctx.prisma.scenario.findUnique({ where: { id } }))
    );
    const scenarioById = new Map(
      scenarios.filter(Boolean).map((scenario: any) => [String(scenario.id), scenario])
    );

    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      externalIdentities,
      sessions: sessions.map((session: any) => ({
        ...session,
        scenario: session.scenarioId
          ? (() => {
              const scenario = scenarioById.get(String(session.scenarioId));
              return scenario ? { name: scenario.name, slug: scenario.slug } : null;
            })()
          : null,
      })),
      invitationsLinked: invitationsLinked.map((invitation: any) => ({
        ...invitation,
        scenario: invitation.scenarioId
          ? (() => {
              const scenario = scenarioById.get(String(invitation.scenarioId));
              return scenario ? { name: scenario.name } : null;
            })()
          : null,
      })),
      sessionCount: sessions.length,
      invitationsCreatedCount,
      hasIdentity: externalIdentities.length > 0,
    };
  }),

  /**
   * Update a user's role.
   * Rules:
   * - Cannot demote yourself
   * - Cannot demote the last ADMIN
   * - GUEST/USER transitions are automatic (via OAuth), manual changes only affect STAFF/ADMIN
   */
  updateRole: adminProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.enum(['GUEST', 'USER', 'STAFF', 'ADMIN']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, role } = input;

      // Cannot change your own role
      if (id === ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot change your own role',
        });
      }

      const targetUser = await ctx.prisma.user.findUnique({
        where: { id },
        select: { role: true },
      });

      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // If demoting from ADMIN, check we're not removing the last one
      if (targetUser.role === 'ADMIN' && role !== 'ADMIN') {
        const adminCount = await ctx.prisma.user.count({
          where: { role: 'ADMIN' },
        });
        if (adminCount <= 1) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot demote the last admin',
          });
        }
      }

      const updatedUser = await ctx.prisma.user.update({
        where: { id },
        data: { role },
      });

      // Log the role change
      await track(ctx.prisma, 'user_role_changed', {
        targetUserId: id,
        oldRole: targetUser.role,
        newRole: role,
        changedBy: ctx.user.id,
      });

      return updatedUser;
    }),
});
