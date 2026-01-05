import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@workspace/database';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { elaborateDescription } from '../../lib/elaborate.js';
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
        allowCustomScenario: invitation.allowCustomScenario,
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
   * For custom scenario invitations, elaborates the user's description
   * (or uses pre-elaborated prompts if provided from preview flow).
   */
  claim: publicProcedure
    .input(
      z.object({
        token: tokenSchema,
        customDescription: z.string().min(10).max(2000).optional(),
        // Pre-elaborated prompts from preview flow (skip re-elaboration if provided)
        elaborated: z
          .object({
            persona: z.string(),
            partnerPrompt: z.string(),
            coachPrompt: z.string(),
          })
          .optional(),
      })
    )
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

      // Validate custom description requirement
      if (invitation.allowCustomScenario && !invitation.scenarioId && !alreadyClaimed) {
        if (!input.customDescription) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Custom description is required for this invitation',
          });
        }
      }

      // Get elaboration result - either pre-provided or generate new
      let elaborationResult: {
        persona: string;
        partnerPrompt: string;
        coachPrompt: string;
      } | null = null;

      if (!alreadyClaimed && input.customDescription) {
        if (input.elaborated) {
          // Use pre-elaborated prompts from preview flow
          elaborationResult = input.elaborated;
        } else {
          // Elaborate now (legacy flow without preview)
          const result = await elaborateDescription(input.customDescription);

          if (!result.success) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: result.refusalReason,
            });
          }

          elaborationResult = {
            persona: result.persona,
            partnerPrompt: result.partnerPrompt,
            coachPrompt: result.coachPrompt,
          };
        }
      }

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
            isCustomScenario: !!elaborationResult,
          },
          { userId }
        );
      }

      // Get or create conversation session
      let sessionId: number;

      // Create new session if first time claiming
      // Note: elaborationResult is only set when !alreadyClaimed, so no need to check it separately
      const shouldCreateNewSession = !alreadyClaimed;

      if (alreadyClaimed && !shouldCreateNewSession) {
        // Return existing session (predefined scenario, already claimed)
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
          if (!invitation.scenarioId && !invitation.allowCustomScenario) {
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
        // Must have either scenarioId OR custom elaboration result
        if (!invitation.scenarioId && !elaborationResult) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invitation has no scenario assigned',
          });
        }

        const newSession = await ctx.prisma.conversationSession.create({
          data: {
            // Use scenarioId if available, otherwise null (custom scenario)
            scenarioId: invitation.scenarioId ?? undefined,
            userId,
            invitationId: invitation.id,
            status: 'ACTIVE',
            // Custom scenario fields
            customDescription: elaborationResult ? input.customDescription : undefined,
            customPartnerPersona: elaborationResult?.persona,
            customPartnerPrompt: elaborationResult?.partnerPrompt,
            customCoachPrompt: elaborationResult?.coachPrompt,
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
          allowCustomScenario: invitation.allowCustomScenario,
          quota: {
            label: quota.label,
            total: quota.tokens,
            remaining: quotaStatus.remaining,
          },
        },
        user,
        alreadyClaimed,
        sessionId,
        // Return custom scenario info if it was elaborated
        customScenario: elaborationResult
          ? {
              persona: elaborationResult.persona,
              description: input.customDescription,
            }
          : undefined,
      };
    }),

  /**
   * Create a new invitation (staff+).
   * Either scenarioId OR allowCustomScenario must be set.
   */
  create: staffProcedure
    .input(
      z
        .object({
          label: z.string().optional(),
          scenarioId: z.number().optional(),
          allowCustomScenario: z.boolean().default(false),
          presetName: z.string(),
          expiresInDays: z.number().min(1).max(365).default(30),
        })
        .refine((data) => data.scenarioId || data.allowCustomScenario, {
          message: 'Either scenarioId or allowCustomScenario must be set',
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
          allowCustomScenario: input.allowCustomScenario,
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
          allowCustomScenario: input.allowCustomScenario,
        },
        { userId: ctx.user.id }
      );

      return {
        id: invitation.id,
        token: invitation.token,
        label: invitation.label,
        scenario: invitation.scenario,
        allowCustomScenario: invitation.allowCustomScenario,
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
      allowCustomScenario: inv.allowCustomScenario,
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
