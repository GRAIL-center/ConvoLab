import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@workspace/database';
import { Role } from '@workspace/database';
import { z } from 'zod';
import { createSession, listSessions } from '../../data/index.js';
import { elaborateDescription } from '../../lib/elaborate.js';
import { getInvitationQuotaStatus, parseQuota } from '../../lib/quota.js';
import { TelemetryEvents, track } from '../../lib/telemetry.js';
import { generateToken } from '../../lib/tokens.js';
import { protectedProcedure, publicProcedure, router, staffProcedure } from '../procedures.js';


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
  const invitation = await prisma.invitation.findUnique({ where: { token } });

  if (!invitation) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
  }

  if (invitation.expiresAt < new Date()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired' });
  }

  // Firestore has no joins (the shim now throws on `include` rather than
  // silently dropping it — see docs/plans/15-firestore-shim-gaps.md), so
  // fetch the related scenario explicitly.
  const scenario = invitation.scenarioId
    ? await prisma.scenario.findUnique({
        where: { id: invitation.scenarioId },
        select: scenarioSelect,
      })
    : null;

  return { ...invitation, scenario };
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

      // If claimed with custom scenario, fetch the existing partner info
      let existingCustomPartner: {
        sessionId: number;
        description: string;
        persona: string;
      } | null = null;

      if (invitation.claimedAt && invitation.allowCustomScenario && !invitation.scenarioId) {
        const session = await ctx.prisma.conversationSession.findFirst({
          where: { invitationId: invitation.id },
          orderBy: { startedAt: 'desc' },
          select: {
            id: true,
            customDescription: true,
            customPartnerPersona: true,
          },
        });

        if (session?.customDescription && session?.customPartnerPersona) {
          existingCustomPartner = {
            sessionId: session.id,
            description: session.customDescription,
            persona: session.customPartnerPersona,
          };
        }
      }

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
        existingCustomPartner,
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
            name: z.string(),
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
        name: string;
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
            name: result.name,
            persona: result.persona,
            partnerPrompt: result.partnerPrompt,
            coachPrompt: result.coachPrompt,
          };
        }
      }

      let userId = ctx.userId ?? undefined;

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
        const [existingSession] = await listSessions({
          userId,
          invitationId: invitation.id,
          limit: 1,
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
          const createdId = await createSession({
            scenarioId: invitation.scenarioId ?? undefined,
            userId,
            invitationId: invitation.id,
            status: 'ACTIVE',
          } as any);
          sessionId = createdId as any;
          await track(
            ctx.prisma,
            TelemetryEvents.CONVERSATION_STARTED,
            {
              scenarioId: invitation.scenarioId,
              scenarioSlug: invitation.scenario?.slug,
              isCustom: false,
              source: 'invitation',
              invitationId: invitation.id,
            },
            { userId, sessionId }
          );
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

        const createdId = await createSession({
          // Use scenarioId if available, otherwise null (custom scenario)
          scenarioId: invitation.scenarioId ?? undefined,
          userId,
          invitationId: invitation.id,
          status: 'ACTIVE',
          // Custom scenario fields
          customDescription: elaborationResult ? input.customDescription : undefined,
          customScenarioName: elaborationResult?.name,
          customPartnerPersona: elaborationResult?.persona,
          customPartnerPrompt: elaborationResult?.partnerPrompt,
          customCoachPrompt: elaborationResult?.coachPrompt,
        } as any);
        sessionId = createdId as any;
        await track(
          ctx.prisma,
          TelemetryEvents.CONVERSATION_STARTED,

          {
            scenarioId: invitation.scenarioId ?? null,
            scenarioSlug: invitation.scenario?.slug ?? (elaborationResult ? 'custom' : null),
            isCustom: !!elaborationResult,
            source: 'invitation',
            invitationId: invitation.id,
          },
          { userId, sessionId }
        );
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
              name: elaborationResult.name,
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
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
          createdById: ctx.user.id,
        },
      });

      const scenario = invitation.scenarioId
        ? await ctx.prisma.scenario.findUnique({
            where: { id: invitation.scenarioId },
            select: { id: true, name: true, slug: true },
          })
        : null;

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
        scenario,
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
      orderBy: { createdAt: 'desc' },
    });

    // Firestore has no joins (the shim now throws on `include` rather than
    // silently dropping it — see docs/plans/15-firestore-shim-gaps.md), so
    // batch-fetch the related scenarios/users/session-counts explicitly
    // instead of one query per invitation.
    const scenarioIds = [...new Set(invitations.map((inv: any) => inv.scenarioId).filter(Boolean))];
    const linkedUserIds = [...new Set(invitations.map((inv: any) => inv.linkedUserId).filter(Boolean))];
    const invitationIds = invitations.map((inv: any) => inv.id);

    // Scenario/user ids are looked up by document id individually rather than
    // a batched `where: { id: { in: [...] } } }` query — Firestore's `in`
    // operator filters on a stored *field* value, and querying by document id
    // that way requires the FieldPath.documentId() sentinel, which the shim
    // doesn't wire up. Per-id findUnique is simpler and definitely correct.
    const [scenarios, linkedUsers, sessions] = await Promise.all([
      Promise.all(
        scenarioIds.map((id) =>
          ctx.prisma.scenario.findUnique({ where: { id }, select: { id: true, name: true, slug: true } })
        )
      ),
      Promise.all(
        linkedUserIds.map((id) =>
          ctx.prisma.user.findUnique({ where: { id }, select: { id: true, name: true } })
        )
      ),
      invitationIds.length
        ? ctx.prisma.conversationSession.findMany({
            where: { invitationId: { in: invitationIds } },
            select: { id: true, invitationId: true },
          })
        : Promise.resolve([]),
    ]);

    // Map keys are normalized to strings: Scenario uses an `Int @id` in
    // schema.prisma, but Firestore doc ids (and thus `s.id` here) are always
    // strings, while `inv.scenarioId` still holds whatever type it was
    // originally stored as.
    const scenarioById = new Map(scenarios.filter(Boolean).map((s: any) => [String(s.id), s]));
    const linkedUserById = new Map(linkedUsers.filter(Boolean).map((u: any) => [String(u.id), u]));
    const sessionCountByInvitationId = new Map<string, number>();
    for (const session of sessions as any[]) {
      sessionCountByInvitationId.set(
        session.invitationId,
        (sessionCountByInvitationId.get(session.invitationId) ?? 0) + 1
      );
    }

    return invitations.map((inv: any) => ({
      id: inv.id,
      token: inv.token,
      label: inv.label,
      scenario: inv.scenarioId ? (scenarioById.get(String(inv.scenarioId)) ?? null) : null,
      allowCustomScenario: inv.allowCustomScenario,
      quota: parseQuota(inv.quota),
      claimedAt: inv.claimedAt,
      linkedUser: inv.linkedUserId ? (linkedUserById.get(String(inv.linkedUserId)) ?? null) : null,
      sessionCount: sessionCountByInvitationId.get(inv.id) ?? 0,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }),

  /**
   * Get available quota presets (any authenticated user).
   */
  getPresets: protectedProcedure.query(async ({ ctx }) => {
    const presets = await ctx.prisma.quotaPreset.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return presets.map((p: any) => ({
      name: p.name,
      label: p.label,
      description: p.description,
      quota: parseQuota(p.quota),
      isDefault: p.isDefault,
    }));
  }),

  /**
   * Get detailed invitation info for researchers (staff+).
   * Returns invitation, all sessions with messages, and observation notes.
   * Used for the InvitationDetail page (QR + status polling + conversation timeline).
   */
  detail: staffProcedure
    .input(z.object({ invitationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
      }

      const [scenario, linkedUser, sessions, observationNotes] = await Promise.all([
        invitation.scenarioId
          ? ctx.prisma.scenario.findUnique({
              where: { id: invitation.scenarioId },
              select: scenarioSelect,
            })
          : Promise.resolve(null),
        invitation.linkedUserId
          ? ctx.prisma.user.findUnique({
              where: { id: invitation.linkedUserId },
              select: { id: true, name: true, role: true },
            })
          : Promise.resolve(null),
        ctx.prisma.conversationSession.findMany({
          where: { invitationId: invitation.id },
          orderBy: { startedAt: 'asc' },
        }),
        ctx.prisma.observationNote.findMany({
          where: { invitationId: invitation.id },
          orderBy: { timestamp: 'desc' },
        }),
      ]);

      const sessionIds = sessions.map((session: any) => session.id);
      const [messages, researchers] = await Promise.all([
        sessionIds.length
          ? ctx.prisma.message.findMany({
              where: { sessionId: { in: sessionIds } },
              orderBy: { timestamp: 'asc' },
              select: { id: true, sessionId: true, role: true, content: true, timestamp: true },
            })
          : Promise.resolve([]),
        Promise.all(
          [...new Set(observationNotes.map((note: any) => note.researcherId).filter(Boolean))].map(
            (id) => ctx.prisma.user.findUnique({ where: { id }, select: { id: true, name: true } })
          )
        ),
      ]);

      const messagesBySessionId = new Map<string, any[]>();
      for (const message of messages as any[]) {
        const key = String(message.sessionId ?? message.conversationSessionId);
        const current = messagesBySessionId.get(key) ?? [];
        current.push(message);
        messagesBySessionId.set(key, current);
      }
      const researcherById = new Map(
        researchers.filter(Boolean).map((researcher: any) => [String(researcher.id), researcher])
      );
      const notesWithResearchers = observationNotes.map((note: any) => ({
        ...note,
        researcher: note.researcherId ? (researcherById.get(String(note.researcherId)) ?? null) : null,
      }));

      const quota = parseQuota(invitation.quota);
      const quotaStatus = await getInvitationQuotaStatus(ctx.prisma, invitation.id, quota);

      // Find the currently active session (if any)
      const activeSession = sessions.find((s: any) => s.status === 'ACTIVE');

      return {
        id: invitation.id,
        token: invitation.token,
        label: invitation.label,
        scenario,
        allowCustomScenario: invitation.allowCustomScenario,
        quota: {
          label: quota.label,
          total: quota.tokens,
          remaining: quotaStatus.remaining,
          used: quota.tokens - quotaStatus.remaining,
        },
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        claimedAt: invitation.claimedAt,
        linkedUser,
        sessions: sessions.map((session: any) => ({
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          totalMessages: session.totalMessages,
          // Custom scenario info if applicable
          customDescription: session.customDescription,
          customPartnerPersona: session.customPartnerPersona,
          // Messages for timeline view
          messages: (messagesBySessionId.get(String(session.id)) ?? []).map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'partner' | 'coach',
            content: m.content,
            timestamp:
              m.timestamp instanceof Date
                ? m.timestamp.toISOString()
                : String(m.timestamp),
          })),
        })),
        observationNotes: notesWithResearchers,
        // Quick access to active session for "Watch Live" button
        activeSessionId: activeSession?.id ?? null,
      };
    }),
});
