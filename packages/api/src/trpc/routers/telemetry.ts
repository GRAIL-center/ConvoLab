import { z } from 'zod';
import { track } from '../../lib/telemetry.js';
import { adminProcedure, publicProcedure, router } from '../procedures.js';

export const telemetryRouter = router({
  /**
   * Track an event from the frontend.
   * Public so anonymous users can be tracked.
   */
  track: publicProcedure
    .input(
      z.object({
        name: z.string().max(100),
        properties: z.record(z.string(), z.any()).optional(),
        sessionId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await track(ctx.prisma, input.name, input.properties ?? {}, {
        userId: ctx.userId ?? undefined,
        sessionId: input.sessionId,
      });
      return { success: true };
    }),

  /**
   * Get distinct event types for filtering.
   */
  eventTypes: adminProcedure.query(async ({ ctx }) => {
    const result = await ctx.prisma.telemetryEvent.findMany({
      select: { name: true },
      distinct: ['name'],
      orderBy: { name: 'asc' },
    });
    return result.map((r) => r.name);
  }),

  /**
   * Get summary metrics for the dashboard cards.
   */
  summary: adminProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate } = input;

      // Run all queries in parallel
      const [totalEvents, conversationsStarted, conversationsCompleted, durationEvents, tokenEvents] =
        await Promise.all([
          ctx.prisma.telemetryEvent.count({
            where: { createdAt: { gte: startDate, lte: endDate } },
          }),
          ctx.prisma.telemetryEvent.count({
            where: { name: 'conversation_started', createdAt: { gte: startDate, lte: endDate } },
          }),
          ctx.prisma.telemetryEvent.count({
            where: {
              name: 'conversation_ended',
              createdAt: { gte: startDate, lte: endDate },
              properties: { path: ['reason'], equals: 'completed' },
            },
          }),
          ctx.prisma.telemetryEvent.findMany({
            where: { name: 'conversation_ended', createdAt: { gte: startDate, lte: endDate } },
            select: { properties: true },
          }),
          ctx.prisma.telemetryEvent.findMany({
            where: { name: 'stream_completed', createdAt: { gte: startDate, lte: endDate } },
            select: { properties: true },
          }),
        ]);

      // Calculate average duration
      let avgDurationMs = 0;
      const durationsMs = durationEvents
        .map((e) => {
          const props = e.properties as Record<string, unknown>;
          return typeof props.durationMs === 'number' ? props.durationMs : null;
        })
        .filter((d): d is number => d !== null);
      if (durationsMs.length > 0) {
        avgDurationMs = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length;
      }

      // Calculate total tokens
      let totalTokens = 0;
      for (const e of tokenEvents) {
        const props = e.properties as Record<string, unknown>;
        const input = typeof props.inputTokens === 'number' ? props.inputTokens : 0;
        const output = typeof props.outputTokens === 'number' ? props.outputTokens : 0;
        totalTokens += input + output;
      }

      return {
        totalEvents,
        conversationsStarted,
        conversationsCompleted,
        completionRate: conversationsStarted > 0 ? conversationsCompleted / conversationsStarted : 0,
        avgDurationMs,
        totalTokens,
      };
    }),

  /**
   * Get paginated list of events for the table view.
   */
  list: adminProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        eventType: z.string().optional(),
        userId: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, eventType, userId, cursor, limit } = input;

      const rawEvents = await ctx.prisma.telemetryEvent.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(eventType && { name: eventType }),
          ...(userId && { userId }),
        },
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (rawEvents.length > limit) {
        const nextItem = rawEvents.pop();
        nextCursor = nextItem?.id;
      }

      // Map to simpler types to avoid deep type instantiation
      const events = rawEvents.map((e) => ({
        id: e.id,
        name: e.name,
        properties: e.properties as Record<string, unknown>,
        userId: e.userId,
        sessionId: e.sessionId,
        createdAt: e.createdAt,
        user: e.user,
      }));

      return {
        events,
        nextCursor,
      };
    }),

  /**
   * Get daily event counts for time series charts.
   */
  timeSeries: adminProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        eventNames: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, eventNames } = input;

      // Get all events in range
      const events = await ctx.prisma.telemetryEvent.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(eventNames && eventNames.length > 0 && { name: { in: eventNames } }),
        },
        select: {
          name: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group by date and event name
      const byDay = new Map<string, Map<string, number>>();

      for (const event of events) {
        const day = event.createdAt.toISOString().split('T')[0];
        if (!byDay.has(day)) {
          byDay.set(day, new Map());
        }
        const dayMap = byDay.get(day)!;
        dayMap.set(event.name, (dayMap.get(event.name) || 0) + 1);
      }

      // Convert to array format for charts
      const result: Array<{ date: string; [key: string]: string | number }> = [];

      for (const [date, counts] of byDay) {
        const entry: { date: string; [key: string]: string | number } = { date };
        for (const [name, count] of counts) {
          entry[name] = count;
        }
        result.push(entry);
      }

      // Get all unique event names for the legend
      const allEventNames = [...new Set(events.map((e) => e.name))];

      return {
        data: result,
        eventNames: allEventNames,
      };
    }),

  /**
   * Get top scenarios by conversation count.
   */
  topScenarios: adminProcedure
    .input(
      z.object({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        limit: z.number().min(1).max(20).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, limit } = input;

      const events = await ctx.prisma.telemetryEvent.findMany({
        where: {
          name: 'conversation_started',
          createdAt: { gte: startDate, lte: endDate },
        },
        select: { properties: true },
      });

      // Count by scenario
      const counts = new Map<string, number>();
      for (const e of events) {
        const props = e.properties as Record<string, unknown>;
        const slug = typeof props.scenarioSlug === 'string' ? props.scenarioSlug : 'unknown';
        counts.set(slug, (counts.get(slug) || 0) + 1);
      }

      // Sort and limit
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

      return sorted.map(([scenario, count]) => ({ scenario, count }));
    }),
});
