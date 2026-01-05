-- DropForeignKey
ALTER TABLE "ConversationSession" DROP CONSTRAINT "ConversationSession_scenarioId_fkey";

-- AlterTable
ALTER TABLE "ConversationSession" ADD COLUMN     "customCoachPrompt" TEXT,
ADD COLUMN     "customDescription" TEXT,
ADD COLUMN     "customPartnerPersona" TEXT,
ADD COLUMN     "customPartnerPrompt" TEXT,
ALTER COLUMN "scenarioId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "allowCustomScenario" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
