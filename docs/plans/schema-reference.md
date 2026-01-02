# Schema Reference

Current Prisma schema. Source of truth is `packages/database/prisma/schema.prisma`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  GUEST
  USER
  STAFF
  ADMIN
}

enum SessionStatus {
  ACTIVE
  PAUSED
  COMPLETED
  ABANDONED
}

model User {
  id        String   @id @default(cuid())
  name      String?
  avatarUrl String?
  role      Role     @default(GUEST)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  lastLoginAt DateTime?

  externalIdentities ExternalIdentity[]
  contactMethods     ContactMethod[]
  sessions           ConversationSession[]
  invitationsCreated Invitation[]          @relation("CreatedInvitations")
  invitationsLinked  Invitation[]          @relation("LinkedInvitations")
  observationNotes   ObservationNote[]
  telemetryEvents    TelemetryEvent[]
}

model ContactMethod {
  id       String  @id @default(cuid())
  userId   String
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  type     String  // "email", "phone", "whatsapp", etc.
  value    String
  verified Boolean @default(false)
  primary  Boolean @default(false) // Primary within this type

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([type, value])
  @@index([userId])
  @@index([userId, type])
}

model ExternalIdentity {
  id         String  @id @default(cuid())
  userId     String
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider   String  // "google", "github", "apple", etc.
  externalId String  // Provider's unique ID (e.g., Google's `sub`)
  email      String? // Email from this provider (informational)

  createdAt DateTime @default(now())

  @@unique([provider, externalId])
  @@index([userId])
  @@index([userId, provider])
}

model Invitation {
  id       String @id @default(cuid())
  token    String @unique
  label    String?

  scenarioId Int?
  scenario   Scenario? @relation(fields: [scenarioId], references: [id])

  quota Json // { tokens: 25000, label: "Short conversation" }
  usage Json @default("{}")

  expiresAt    DateTime
  claimedAt    DateTime?
  linkedUserId String?
  linkedUser   User?    @relation("LinkedInvitations", fields: [linkedUserId], references: [id])

  createdById String
  createdBy   User     @relation("CreatedInvitations", fields: [createdById], references: [id])
  createdAt   DateTime @default(now())

  sessions         ConversationSession[]
  observationNotes ObservationNote[]

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

  status          SessionStatus @default(ACTIVE)
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  totalMessages   Int       @default(0)
  durationSeconds Int?

  messages         Message[]
  usageLogs        UsageLog[]
  observationNotes ObservationNote[]

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

  @@index([invitationId])
  @@index([researcherId])
}

// ============================================
// TELEMETRY
// ============================================

model TelemetryEvent {
  id         String   @id @default(cuid())
  name       String   // e.g., "conversation_started", "message_sent"
  properties Json     @default("{}")

  userId     String?
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  sessionId  Int?     // ConversationSession ID, if applicable

  createdAt  DateTime @default(now())

  @@index([name])
  @@index([createdAt])
  @@index([userId])
  @@index([name, createdAt])
}
```

## Auth Model

- **Anonymous users**: User record with no ExternalIdentity, role=GUEST
- **Authenticated users**: User record with ExternalIdentity, role>=USER
- **External identities**: Separate table, supports multiple Google accounts per user, easy to add GitHub/Apple/etc.
- **Contact methods**: Separate table, supports email/phone/whatsapp/etc., one primary per type
- **Progressive auth**: Anonymous user can link OAuth later, existing User record gets updated
- **Merge on conflict**: If anonymous user authenticates with OAuth that's already linked to another user, anonymous user's data is merged into existing user
