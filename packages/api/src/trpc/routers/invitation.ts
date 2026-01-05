import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@workspace/database';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { getInvitationQuotaStatus, parseQuota } from '../../lib/quota.js';
import { TelemetryEvents, track } from '../../lib/telemetry.js';
import { generateToken } from '../../lib/tokens.js';
import { publicProcedure, router, staffProcedure } from '../procedures.js';

// Base64url token format (32 bytes = 43 chars, no padding)
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid token format');

// Scenario fields included in invitation queries
const scenarioSelect = {
  id: true,
  name: true,
  description: true,
  slug: true,
  partnerPersona: true,
} as const;

/**
 * Fetch an invitation by token and validate it's usable.
 * Throws TRPCError if not found or expired.
 */
async function getValidInvitation(prisma: PrismaClient, token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { scenario: { select: scenarioSelect } },
  });

  if (!invitation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
  }

  if (invitation.expiresAt < new Date()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired' });
  }

  return invitation;
}

export const invitationRouter = router({
  /**
   * Validate an invitation token without claiming it.
   * Returns scenario preview and quota info.
   */
  validate: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .query(async ({ ctx, input }) => {
      const invitation = await getValidInvitation(ctx.prisma, input.token);
      const quota = parseQuota(invitation.quota);
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
      const invitation = await getValidInvitation(ctx.prisma, input.token);

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

        // Track invitation claimed event
        await track(
          ctx.prisma,
          TelemetryEvents.INVITATION_CLAIMED,
          {
            invitationId: invitation.id,
            scenarioId: invitation.scenario?.id,
            scenarioSlug: invitation.scenario?.slug,
          },
          { userId }
        );
      }

      // Get or create conversation session
      let sessionId: number;

      if (alreadyClaimed) {
        // Find most recent session for this user+invitation
        const existingSession = await ctx.prisma.conversationSession.findFirst({
          where: {
            userId,
            invitationId: invitation.id,
          },
          orderBy: { startedAt: 'desc' },
          select: { id: true },
        });

        if (existingSession) {
          sessionId = existingSession.id;
        } else {
          // Edge case: claimed but no session exists (shouldn't happen, but handle it)
          if (!invitation.scenarioId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Invitation has no scenario assigned',
            });
          }
          const newSession = await ctx.prisma.conversationSession.create({
            data: {
              scenarioId: invitation.scenarioId,
              userId,
              invitationId: invitation.id,
              status: 'ACTIVE',
            },
          });
          sessionId = newSession.id;
        }
      } else {
        // Create new session for first-time claim
        if (!invitation.scenarioId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invitation has no scenario assigned',
          });
        }

        const newSession = await ctx.prisma.conversationSession.create({
          data: {
            scenarioId: invitation.scenarioId,
            userId,
            invitationId: invitation.id,
            status: 'ACTIVE',
          },
        });
        sessionId = newSession.id;
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

      const quota = parseQuota(invitation.quota);
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
        sessionId,
      };
    }),

  /**
   * Create a new invitation (staff+).
   */
  create: staffProcedure
    .input(
      z.object({
        label: z.string().optional(),
        scenarioId: z.number(), // Required - conversations need a scenario
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

      const quota = parseQuota(preset.quota);

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

      // Track invitation created event
      await track(
        ctx.prisma,
        TelemetryEvents.INVITATION_CREATED,
        {
          invitationId: invitation.id,
          presetName: input.presetName,
          scenarioId: input.scenarioId,
        },
        { userId: ctx.user.id }
      );

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
   * List invitations created by the current user (staff+).
   */
  list: staffProcedure.query(async ({ ctx }) => {
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
      quota: parseQuota(inv.quota),
      claimedAt: inv.claimedAt,
      linkedUser: inv.linkedUser,
      sessionCount: inv._count.sessions,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }),

  /**
   * Get available quota presets (staff+).
   */
  getPresets: staffProcedure.query(async ({ ctx }) => {
    const presets = await ctx.prisma.quotaPreset.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return presets.map((p) => ({
      name: p.name,
      label: p.label,
      description: p.description,
      quota: parseQuota(p.quota),
      isDefault: p.isDefault,
    }));
  }),
});
