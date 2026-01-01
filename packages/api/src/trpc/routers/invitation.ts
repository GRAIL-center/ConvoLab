import { TRPCError } from '@trpc/server';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { getInvitationQuotaStatus, type Quota } from '../../lib/quota.js';
import { generateToken } from '../../lib/tokens.js';
import { adminProcedure, publicProcedure, router } from '../procedures.js';

// Base64url token format (32 bytes = 43 chars, no padding)
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid token format');

export const invitationRouter = router({
  /**
   * Validate an invitation token without claiming it.
   * Returns scenario preview and quota info.
   */
  validate: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { token: input.token },
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              partnerPersona: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }

      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired' });
      }

      const quota = invitation.quota as unknown as Quota;
      const quotaStatus = await getInvitationQuotaStatus(ctx.prisma, invitation.id, quota);

      return {
        id: invitation.id,
        scenario: invitation.scenario,
        quota: {
          label: quota.label,
          total: quota.tokens,
          remaining: quotaStatus.remaining,
        },
        claimed: !!invitation.claimedAt,
        expiresAt: invitation.expiresAt,
      };
    }),

  /**
   * Claim an invitation. Creates anonymous user if needed, links invitation.
   */
  claim: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { token: input.token },
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }

      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired' });
      }

      // Check if already claimed by a different user
      if (invitation.linkedUserId && invitation.linkedUserId !== ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invitation has already been claimed',
        });
      }

      // If already claimed by current user, return success (idempotent)
      const alreadyClaimed = !!invitation.claimedAt && invitation.linkedUserId === ctx.userId;

      let userId = ctx.userId;

      // If no session user, create anonymous user
      if (!userId) {
        const anonymousUser = await ctx.prisma.user.create({
          data: {
            role: Role.GUEST,
          },
        });
        userId = anonymousUser.id;
        ctx.req.session.set('userId', userId);
      }

      // Link invitation to user if not already linked
      if (!invitation.linkedUserId) {
        await ctx.prisma.invitation.update({
          where: { id: invitation.id },
          data: {
            linkedUserId: userId,
            claimedAt: new Date(),
          },
        });
      }

      // Get user info
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          role: true,
          avatarUrl: true,
        },
      });

      const quota = invitation.quota as unknown as Quota;
      const quotaStatus = await getInvitationQuotaStatus(ctx.prisma, invitation.id, quota);

      return {
        invitation: {
          id: invitation.id,
          scenario: invitation.scenario,
          quota: {
            label: quota.label,
            total: quota.tokens,
            remaining: quotaStatus.remaining,
          },
        },
        user,
        alreadyClaimed,
      };
    }),

  /**
   * Create a new invitation (admin only).
   */
  create: adminProcedure
    .input(
      z.object({
        label: z.string().optional(),
        scenarioId: z.number().optional(),
        presetName: z.string(),
        expiresInDays: z.number().min(1).max(365).default(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get quota preset
      const preset = await ctx.prisma.quotaPreset.findUnique({
        where: { name: input.presetName },
      });

      if (!preset) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Quota preset not found' });
      }

      const quota = preset.quota as unknown as Quota;

      const invitation = await ctx.prisma.invitation.create({
        data: {
          token: generateToken(),
          label: input.label,
          scenarioId: input.scenarioId,
          quota: { tokens: quota.tokens, label: preset.label },
          expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
          createdById: ctx.user.id,
        },
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return {
        id: invitation.id,
        token: invitation.token,
        label: invitation.label,
        scenario: invitation.scenario,
        quota: invitation.quota,
        expiresAt: invitation.expiresAt,
      };
    }),

  /**
   * List invitations created by the current user (admin only).
   */
  list: adminProcedure.query(async ({ ctx }) => {
    const invitations = await ctx.prisma.invitation.findMany({
      where: { createdById: ctx.user.id },
      include: {
        scenario: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        linkedUser: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            sessions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      token: inv.token,
      label: inv.label,
      scenario: inv.scenario,
      quota: inv.quota as unknown as Quota,
      claimedAt: inv.claimedAt,
      linkedUser: inv.linkedUser,
      sessionCount: inv._count.sessions,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }),

  /**
   * Get available quota presets (admin only).
   */
  getPresets: adminProcedure.query(async ({ ctx }) => {
    const presets = await ctx.prisma.quotaPreset.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return presets.map((p) => ({
      name: p.name,
      label: p.label,
      description: p.description,
      quota: p.quota as unknown as Quota,
      isDefault: p.isDefault,
    }));
  }),
});
