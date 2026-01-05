# Phase 11: User-Defined Conversation Partners

Allow participants to describe their own conversation partner instead of predefined scenarios.

## User Flow

1. Researcher creates invitation with `allowCustomScenario: true` (no scenarioId)
2. User opens link → sees description input instead of scenario preview
3. User submits description → Sonnet elaboration AI generates prompts
4. Session created with custom prompts, conversation proceeds normally

## Database Changes

### ConversationSession (new optional fields)

```prisma
model ConversationSession {
  // scenarioId becomes optional
  scenarioId Int?
  scenario   Scenario? @relation(...)

  // Custom scenario fields
  customDescription     String? @db.Text  // User's raw input
  customPartnerPersona  String?           // Generated persona name
  customPartnerPrompt   String? @db.Text  // Generated system prompt
  customCoachPrompt     String? @db.Text  // Generated coach prompt
}
```

### Invitation (new field)

```prisma
model Invitation {
  scenarioId          Int?     // Now optional
  allowCustomScenario Boolean  @default(false)
}
```

## API Changes

### packages/api/src/trpc/routers/scenario.ts

New `elaborate` mutation:
```typescript
elaborate: publicProcedure
  .input(z.object({ description: z.string().min(10).max(2000) }))
  .mutation(async ({ input }) => {
    // Call Sonnet with meta-prompt
    // Returns: { approved, persona, partnerPrompt, coachPrompt, refusalReason? }
  })
```

### packages/api/src/trpc/routers/invitation.ts

- Make `scenarioId` optional when `allowCustomScenario: true`
- `claim` accepts optional `customDescription`
- If custom, call elaborate internally and store on session

### packages/api/src/ws/conversation.ts

```typescript
const partnerPrompt = session.customPartnerPrompt ?? session.scenario?.partnerSystemPrompt;
const coachPrompt = session.customCoachPrompt ?? session.scenario?.coachSystemPrompt;
```

## Frontend Changes

### packages/app/src/pages/Invite.tsx

When `invitation.allowCustomScenario && !invitation.scenarioId`:
- Show description textarea instead of scenario preview
- Submit description with claim request

### packages/app/src/pages/research/InvitationList.tsx

- Checkbox/toggle for "Allow custom scenario"
- When checked, scenario dropdown disabled
- Show custom descriptions in invitation list

## Elaboration AI Meta-Prompt

Safety constraints:
- Refuse harassment/intimidation practice
- Refuse illegal activity roleplay
- Refuse sexually explicit scenarios
- Refuse targeting specific public figures

Prompt injection defense: AI interprets user intent semantically, doesn't execute raw input.

## Design Decisions

- **Model**: Sonnet (quality prompts matter)
- **Quota**: Elaboration doesn't count against invitation quota
- **Caching**: None - regenerate each time (simpler)

## Depends On

- Phase 4 (Invitation system)
- Phase 3b (Streaming/conversation infrastructure)
