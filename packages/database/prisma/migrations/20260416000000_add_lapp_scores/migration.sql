-- CreateTable
CREATE TABLE "LappScore" (
    "id" SERIAL NOT NULL,
    "userMessageId" INTEGER NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "l" INTEGER NOT NULL,
    "a" INTEGER NOT NULL,
    "p" INTEGER NOT NULL,
    "pe" INTEGER NOT NULL,
    "tone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LappScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LappScore_userMessageId_key" ON "LappScore"("userMessageId");

-- CreateIndex
CREATE INDEX "LappScore_sessionId_idx" ON "LappScore"("sessionId");

-- AddForeignKey
ALTER TABLE "LappScore" ADD CONSTRAINT "LappScore_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LappScore" ADD CONSTRAINT "LappScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
