-- Update scenarios using deprecated model IDs
UPDATE "Scenario" SET "coachModel" = 'claude-sonnet-4-6' WHERE "coachModel" IN ('claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022');
UPDATE "Scenario" SET "partnerModel" = 'google:gemini-2.5-flash' WHERE "partnerModel" IN ('claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022');

-- Update schema defaults
ALTER TABLE "Scenario" ALTER COLUMN "partnerModel" SET DEFAULT 'google:gemini-2.5-flash';
ALTER TABLE "Scenario" ALTER COLUMN "coachModel" SET DEFAULT 'claude-sonnet-4-6';
