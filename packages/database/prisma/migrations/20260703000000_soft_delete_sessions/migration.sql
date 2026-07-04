-- Add soft-delete support to ConversationSession
ALTER TABLE "ConversationSession" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index for filtering out deleted sessions efficiently
CREATE INDEX "ConversationSession_deletedAt_idx" ON "ConversationSession"("deletedAt");
