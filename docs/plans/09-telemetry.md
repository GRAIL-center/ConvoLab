# Phase 9: Telemetry

DIY event tracking using PostgreSQL. Lightweight, no external dependencies.

## Schema

```prisma
model TelemetryEvent {
  id         String   @id @default(cuid())
  name       String   // e.g., "conversation_started", "message_sent"
  properties Json     @default("{}")

  userId     String?
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  sessionId  Int?     // ConversationSession, if applicable

  createdAt  DateTime @default(now())

  @@index([name])
  @@index([createdAt])
  @@index([userId])
  @@index([name, createdAt])
}
```

Update User model:
```prisma
model User {
  // ... existing fields
  telemetryEvents TelemetryEvent[]
}
```

## Event Catalog

### Conversation Lifecycle
| Event | Properties | When |
|-------|------------|------|
| `conversation_started` | `{ scenarioId, scenarioSlug, invitationId?, source }` | User begins conversation |
| `message_sent` | `{ length, timeSinceLastMs }` | User sends message |
| `conversation_ended` | `{ reason, durationMs, messageCount }` | Session ends (completed/abandoned/quota) |

### Streaming & Models
| Event | Properties | When |
|-------|------------|------|
| `stream_completed` | `{ streamType, model, inputTokens, outputTokens, latencyMs }` | Partner/coach response finishes |
| `stream_error` | `{ streamType, model, errorCode, retryable }` | LLM provider error |
| `reconnection` | `{ attemptNumber, success }` | WebSocket reconnect |

### Quota
| Event | Properties | When |
|-------|------------|------|
| `quota_warning` | `{ remainingTokens, totalQuota, percentUsed }` | Hit 80% usage |
| `quota_exhausted` | `{ totalUsed, quota }` | Tokens depleted |

### Invitations (Phase 4/6)
| Event | Properties | When |
|-------|------------|------|
| `invitation_created` | `{ presetName, scenarioId? }` | Staff creates invitation |
| `invitation_claimed` | `{ invitationId, source }` | User claims invitation |
| `qr_scanned` | `{ invitationId, userAgent }` | QR code accessed |

### Research (Phase 6)
| Event | Properties | When |
|-------|------------|------|
| `observation_note_added` | `{ invitationId, sessionId?, length }` | Researcher adds note |

### Auth
| Event | Properties | When |
|-------|------------|------|
| `user_authenticated` | `{ provider, isNewUser, mergedFrom? }` | OAuth complete |
| `user_merged` | `{ fromUserId, toUserId }` | Anonymous merged into existing |

### Landing (Phase 7)
| Event | Properties | When |
|-------|------------|------|
| `page_viewed` | `{ path, referrer? }` | Page load |
| `cta_clicked` | `{ ctaId, destination }` | CTA button clicked |

## API

### Backend Helper

```typescript
// packages/api/src/lib/telemetry.ts
import type { PrismaClient } from "@workspace/database";

export async function track(
  prisma: PrismaClient,
  name: string,
  properties: Record<string, unknown> = {},
  options: { userId?: string; sessionId?: number } = {}
) {
  await prisma.telemetryEvent.create({
    data: {
      name,
      properties,
      userId: options.userId,
      sessionId: options.sessionId,
    },
  });
}

// Convenience for request context
export function createTracker(
  prisma: PrismaClient,
  userId?: string
) {
  return (
    name: string,
    properties?: Record<string, unknown>,
    sessionId?: number
  ) => track(prisma, name, properties, { userId, sessionId });
}
```

### Usage in tRPC

```typescript
// In any procedure
const track = createTracker(ctx.prisma, ctx.user?.id);
await track("conversation_started", { scenarioId: input.scenarioId });
```

### Frontend Endpoint (optional)

```typescript
// packages/api/src/trpc/routers/telemetry.ts
export const telemetryRouter = router({
  track: publicProcedure
    .input(z.object({
      name: z.string().max(100),
      properties: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await track(ctx.prisma, input.name, input.properties ?? {}, {
        userId: ctx.user?.id,
      });
    }),
});
```

## Query Examples

```sql
-- Events per day
SELECT DATE(created_at) as day, name, COUNT(*)
FROM "TelemetryEvent"
GROUP BY day, name
ORDER BY day DESC;

-- Conversation completion rate
SELECT
  COUNT(*) FILTER (WHERE name = 'conversation_started') as started,
  COUNT(*) FILTER (WHERE name = 'conversation_ended'
    AND properties->>'reason' = 'completed') as completed
FROM "TelemetryEvent"
WHERE created_at > NOW() - INTERVAL '7 days';

-- Average session duration
SELECT AVG((properties->>'durationMs')::int) / 1000 as avg_seconds
FROM "TelemetryEvent"
WHERE name = 'conversation_ended'
  AND created_at > NOW() - INTERVAL '7 days';

-- Token usage by scenario
SELECT
  properties->>'scenarioSlug' as scenario,
  SUM((properties->>'inputTokens')::int + (properties->>'outputTokens')::int) as total_tokens
FROM "TelemetryEvent"
WHERE name = 'stream_completed'
GROUP BY scenario;

-- Invitation conversion funnel
SELECT
  COUNT(*) FILTER (WHERE name = 'invitation_created') as created,
  COUNT(*) FILTER (WHERE name = 'invitation_claimed') as claimed,
  COUNT(*) FILTER (WHERE name = 'conversation_started') as started,
  COUNT(*) FILTER (WHERE name = 'conversation_ended'
    AND properties->>'reason' = 'completed') as completed
FROM "TelemetryEvent"
WHERE created_at > NOW() - INTERVAL '30 days';
```

## Migration Path

If we outgrow DIY:
1. **PostHog Cloud** — 1M events/month free, drop-in replacement
2. **Self-hosted Umami** — Uses same PostgreSQL, lightweight
3. **Export to data warehouse** — Dump `TelemetryEvent` table periodically

## Implementation Order

1. Add schema, run migration
2. Create `telemetry.ts` helper
3. Add tracking calls to existing code (conversations, auth)
4. Optional: Add frontend tracking endpoint
5. Optional: Build admin dashboard with basic charts
