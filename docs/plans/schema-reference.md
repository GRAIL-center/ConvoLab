# Schema Reference

Full Prisma schema for Phase 1. Copy/paste ready.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

// ============================================
// ENUMS
// ============================================

enum Role {
  GUEST
  USER
  POWER_USER
  ADMIN
}

// ============================================
// USER & AUTH
// ============================================

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  avatarUrl String?
  googleId  String?  @unique
  role      Role     @default(GUEST)
  isStaff   Boolean  @default(false)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  lastLoginAt DateTime?

  sessions           ConversationSession[]
  invitationsCreated Invitation[]          @relation("CreatedInvitations")

  @@index([googleId])
}

model Invitation {
  id       String @id @default(cuid())
  token    String @unique

  scenarioId Int?
  scenario   Scenario? @relation(fields: [scenarioId], references: [id])

  quota Json // { tokens: 25000, label: "Short conversation" }
  usage Json @default("{}")

  expiresAt    DateTime
  claimedAt    DateTime?
  linkedUserId String?
  linkedUser   User?    @relation(fields: [linkedUserId], references: [id])

  createdById String
  createdBy   User     @relation("CreatedInvitations", fields: [createdById], references: [id])
  createdAt   DateTime @default(now())

  sessions ConversationSession[]

  @@index([token])
  @@index([expiresAt])
}

model QuotaPreset {
  id          String  @id @default(cuid())
  name        String  @unique
  label       String
  description String?
  quota       Json
  isDefault   Boolean @default(false)
  sortOrder   Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

// ============================================
// SCENARIOS & CONVERSATIONS
// ============================================

model Scenario {
  id          Int    @id @default(autoincrement())
  name        String
  description String @db.Text
  slug        String @unique

  partnerPersona      String
  partnerSystemPrompt String @db.Text
  coachSystemPrompt   String @db.Text
  partnerModel        String @default("claude-sonnet-4-20250514")
  coachModel          String @default("claude-sonnet-4-20250514")

  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sessions    ConversationSession[]
  invitations Invitation[]
}

model ConversationSession {
  id Int @id @default(autoincrement())

  userId       String?
  user         User?       @relation(fields: [userId], references: [id])
  invitationId String?
  invitation   Invitation? @relation(fields: [invitationId], references: [id])

  scenarioId Int
  scenario   Scenario @relation(fields: [scenarioId], references: [id])

  status          String    @default("active")
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  totalMessages   Int       @default(0)
  durationSeconds Int?

  messages  Message[]
  usageLogs UsageLog[]

  @@index([userId])
  @@index([invitationId])
  @@index([status])
}

model Message {
  id        Int      @id @default(autoincrement())
  sessionId Int
  session   ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  role      String   // "user" | "partner" | "coach"
  content   String   @db.Text
  timestamp DateTime @default(now())
  audioUrl  String?
  metadata  Json?

  @@index([sessionId])
}

// ============================================
// USAGE TRACKING
// ============================================

model UsageLog {
  id String @id @default(cuid())

  userId       String?
  invitationId String?
  sessionId    Int?
  session      ConversationSession? @relation(fields: [sessionId], references: [id])

  model        String
  streamType   String // "partner" | "coach"
  inputTokens  Int
  outputTokens Int
  timestamp    DateTime @default(now())

  @@index([userId, timestamp])
  @@index([invitationId, timestamp])
  @@index([timestamp])
}
```

## Env for Prisma 7

```typescript
// packages/database/index.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';
```
