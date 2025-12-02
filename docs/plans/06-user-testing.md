# Phase 6: User Testing Features

Support guerrilla user testing (QR codes, observation notes).

## Database

Already added in Phase 1:
```prisma
model ObservationNote {
  id           String   @id @default(cuid())
  invitationId String
  invitation   Invitation @relation(fields: [invitationId], references: [id])
  sessionId    Int?
  session      ConversationSession? @relation(fields: [sessionId], references: [id])
  researcherId String
  researcher   User     @relation(fields: [researcherId], references: [id])
  content      String   @db.Text
  timestamp    DateTime @default(now())
}
```

## New Files

### packages/api/src/trpc/routers/observation.ts
```typescript
- create: protectedProcedure (add note to invitation or session)
- list: protectedProcedure (get notes for invitation, filtered by researcher)
- delete: protectedProcedure (own notes only)
```

### packages/app/src/components/QRCode.tsx
- Wrap `qrcode.react` library
- Generate QR from invitation URL

### packages/app/src/pages/ResearcherDashboard.tsx
- List invitations created by current user
- Show sessions per invitation
- Add/view observation notes
- Display QR code for each invitation

## Frontend Routes

```
/researcher              → Dashboard (list your invitations)
/researcher/invite/:id   → Single invitation detail + notes + QR
```

## Dependencies

```bash
pnpm -F @workspace/app add qrcode.react
```

## Depends On

- Phase 1 (ObservationNote model)
- Phase 4 (Invitation system)
- Phase 5 (Frontend auth)
