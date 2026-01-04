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

      const users = await ctx.prisma.user.findMany({
        where: {
          ...(roleFilter && { role: roleFilter }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              {
                externalIdentities: { some: { email: { contains: search, mode: 'insensitive' } } },
              },
            ],
          }),
        },
        include: {
          externalIdentities: {
            select: { provider: true, email: true },
          },
          _count: {
            select: { sessions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (users.length > limit) {
        const nextItem = users.pop();
        nextCursor = nextItem?.id;
      }

      return {
        users: users.map((u) => ({
          id: u.id,
          name: u.name,
          avatarUrl: u.avatarUrl,
          role: u.role,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          sessionCount: u._count.sessions,
          email: u.externalIdentities[0]?.email ?? null,
          provider: u.externalIdentities[0]?.provider ?? null,
          hasIdentity: u.externalIdentities.length > 0,
        })),
        nextCursor,
      };
    }),

  /**
   * Get a single user with full details.
   */
  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: input.id },
      include: {
        externalIdentities: {
          select: { id: true, provider: true, email: true, createdAt: true },
        },
        sessions: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            totalMessages: true,
            scenario: { select: { name: true, slug: true } },
          },
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        invitationsLinked: {
          select: {
            id: true,
            token: true,
            label: true,
            claimedAt: true,
            scenario: { select: { name: true } },
          },
          take: 5,
        },
        _count: {
          select: { sessions: true, invitationsCreated: true },
        },
      },
    });

    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLoginAt: user.lastLoginAt,
      externalIdentities: user.externalIdentities,
      sessions: user.sessions,
      invitationsLinked: user.invitationsLinked,
      sessionCount: user._count.sessions,
      invitationsCreatedCount: user._count.invitationsCreated,
      hasIdentity: user.externalIdentities.length > 0,
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
        select: { id: true, name: true, role: true },
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
