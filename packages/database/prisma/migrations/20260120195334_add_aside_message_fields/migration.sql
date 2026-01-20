-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "asideThreadId" TEXT,
ADD COLUMN     "messageType" TEXT NOT NULL DEFAULT 'main';

-- CreateIndex
CREATE INDEX "Message_sessionId_messageType_idx" ON "Message"("sessionId", "messageType");

-- CreateIndex
CREATE INDEX "Message_asideThreadId_idx" ON "Message"("asideThreadId");
