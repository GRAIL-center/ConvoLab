import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createSession, listSessions } from '../../data/index.js';
import { parseQuota } from '../../lib/quota.js';
import { TelemetryEvents, track } from '../../lib/telemetry.js';
import { generateToken } from '../../lib/tokens.js';
import { protectedProcedure, publicProcedure, router } from '../procedures.js';

type SessionSummarySource = {
  id: string | number;
  scenario?: unknown;
  scenarioId?: string | number | null;
  status?: string;
  totalMessages?: unknown;
  _count?: { messages?: unknown };
  messages?: unknown;
  startedAt?: unknown;
};

type ScenarioWhereUnique = { id: string | number };

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { seconds?: unknown }).seconds === 'number'
  ) {
    return new Date((value as { seconds: number }).seconds * 1000).toISOString();
  }
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { _seconds?: unknown })._seconds === 'number'
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  return new Date().toISOString();
}

function numericCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const scenarioIdSchema = z
  .union([z.number().int().positive(), z.string().trim().min(1)])
  .optional();

export const sessionRouter = router({
  /**
   * Start a new conversation session (any authenticated user).
   * Creates an auto-assigned invitation and session in one step.
   *
   * Supports two modes:
   * 1. Predefined scenario: provide scenarioId
   * 2. Custom scenario: provide customDescription + elaborated prompts
   */
  startNew: protectedProcedure
    .input(
      z
        .object({
          presetName: z.string(),
          // Option 1: Predefined scenario
          scenarioId: scenarioIdSchema,
          // Option 2: Custom scenario (provide elaborated result from preview)
          customDescription: z.string().min(10).max(2000).optional(),
          elaborated: z
            .object({
              name: z.string(),
              persona: z.string(),
              partnerPrompt: z.string(),
              coachPrompt: z.string(),
            })
            .optional(),
        })
        .refine((data) => data.scenarioId || (data.customDescription && data.elaborated), {
          message: 'Either scenarioId or customDescription+elaborated must be provided',
        })
    )
    .mutation(async ({ ctx, input }) => {
      // Get quota preset
      const preset = await ctx.prisma.quotaPreset.findUnique({
        where: { name: input.presetName },
      });

      if (!preset) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Quota preset not found',
        });
      }

      const quota = parseQuota(preset.quota);

      // Predefined scenario path
      if (input.scenarioId) {
				const scenario = await ctx.prisma.scenario.findUnique({
					where: { id: input.scenarioId } as ScenarioWhereUnique,
					select: { id: true, name: true, slug: true },
				});

        if (!scenario) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Scenario not found',
          });
        }

        const invitation = await ctx.prisma.invitation.create({
          data: {
            token: generateToken(),
            label: `Staff quick-start: ${scenario.name}`,
            scenarioId: scenario.id,
            quota: { tokens: quota.tokens, label: preset.label },
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            createdById: ctx.user.id,
            linkedUserId: ctx.user.id,
            claimedAt: new Date(),
          },
        });

        const sessionId = await createSession({
          scenarioId: scenario.id,
          userId: ctx.user.id,
          invitationId: invitation.id,
          status: 'ACTIVE',
        } as Parameters<typeof createSession>[0]);

        await track(
          ctx.prisma,
          TelemetryEvents.CONVERSATION_STARTED,
          {
            scenarioId: scenario.id,
            scenarioSlug: scenario.slug,
            isCustom: false,
            source: 'staff_quickstart',
          },
          { userId: ctx.user.id, sessionId }
        );

        return { sessionId };
      }

      // Custom scenario path
      const { customDescription, elaborated } = input;
      if (!customDescription || !elaborated) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Custom scenario requires description and elaborated prompts',
        });
      }

      const invitation = await ctx.prisma.invitation.create({
        data: {
          token: generateToken(),
          label: `Staff quick-start: ${elaborated.name}`,
          allowCustomScenario: true,
          quota: { tokens: quota.tokens, label: preset.label },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
          createdById: ctx.user.id,
          linkedUserId: ctx.user.id,
          claimedAt: new Date(),
        },
      });

      const sessionId = await createSession({
        userId: ctx.user.id,
        invitationId: invitation.id,
        status: 'ACTIVE',
        customDescription,
        customScenarioName: elaborated.name,
        customPartnerPersona: elaborated.persona,
        customPartnerPrompt: elaborated.partnerPrompt,
        customCoachPrompt: elaborated.coachPrompt,
      } as Parameters<typeof createSession>[0]);

      await track(
        ctx.prisma,
        TelemetryEvents.CONVERSATION_STARTED,
        {
          scenarioSlug: 'custom',
          isCustom: true,
          source: 'staff_quickstart',
        },
        { userId: ctx.user.id, sessionId }
      );

      return { sessionId };
    }),

  /**
   * List all conversation sessions for the current user.
   * Returns empty array if not authenticated.
   */
  listMine: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return [];

    const sessions = await listSessions({ userId: ctx.userId });

    return Promise.all(
      (sessions as SessionSummarySource[]).map(async (s) => {
        const [scenario, fallbackMessageCount] = await Promise.all([
          s.scenario
            ? Promise.resolve(s.scenario)
            : s.scenarioId
              ? ctx.prisma.scenario.findUnique({
                  where: { id: s.scenarioId },
                  select: { id: true, name: true, partnerPersona: true },
                })
              : Promise.resolve(null),
          numericCount(s.totalMessages) === null && !s.messages && !s._count?.messages
            ? ctx.prisma.message.count({ where: { sessionId: String(s.id) } })
            : Promise.resolve(null),
        ]);

        return {
          id: s.id,
          scenario,
          status: s.status,
          messageCount:
            numericCount(s.totalMessages) ??
            numericCount(s._count?.messages) ??
            (Array.isArray(s.messages) ? s.messages.length : (fallbackMessageCount ?? 0)),
          startedAt: toIsoString(s.startedAt),
        };
      })
    );
  }),
});
