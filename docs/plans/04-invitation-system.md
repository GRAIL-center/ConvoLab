# Phase 4: Invitation System

Magic links with quota.

## New Files

### packages/api/src/lib/tokens.ts
- generateToken() → crypto random base64url
- Secure comparison helper

### packages/api/src/lib/quota.ts
- checkQuota(invitationId) → { allowed, remaining, total }
- deductQuota(invitationId, tokens) → atomic update
- JSON schema types for quota/usage

### packages/api/src/trpc/routers/invitation.ts
Procedures:
- create (admin) - new invitation with preset quota
- validate (public) - check token, return scenario preview
- startSession (public) - create ConversationSession from invitation
- claim (protected) - link invitation to authenticated user

## Frontend

### packages/app/src/pages/Invite.tsx
- Route: /invite/:token
- Validate token on mount
- Show scenario preview + quota info
- "Start Conversation" button
- "Save your progress" → Google login prompt

### packages/app/src/App.tsx
- Add route for /invite/:token

## Quota Presets Seeding

Add to seed.ts:
```typescript
const presets = [
  { name: 'quick-chat', label: 'Quick chat', quota: { tokens: 10000 } },
  { name: 'short-conversation', label: 'Short conversation', quota: { tokens: 25000 } },
  { name: 'therapy-session', label: 'Therapy session', quota: { tokens: 50000 } },
];
```

## Dependencies

- Phase 1 (Invitation model)
- Phase 3 (tRPC setup)
