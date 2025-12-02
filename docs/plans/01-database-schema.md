# Phase 1: Database Schema

Update Prisma schema with new auth model.

## Changes

### User Model
- Change id: Int → String (cuid)
- Remove: passwordHash
- Add: googleId, avatarUrl, role enum
- Rename: username → name

### New Models
- Invitation (magic links with quota)
- QuotaPreset (admin-configurable templates)
- UsageLog (analytics)

### Modified Models
- ConversationSession: make userId nullable, add invitationId

## Files

- `packages/database/prisma/schema.prisma` - Full schema rewrite
- `packages/database/prisma/seed.ts` - QuotaPresets + test invitation
- `packages/database/index.ts` - May need type exports

## Commands

```bash
# After schema changes:
pnpm -F @workspace/database prisma migrate dev --name auth_overhaul
pnpm -F @workspace/database prisma generate
```

## Dependencies

None (first implementation phase)
