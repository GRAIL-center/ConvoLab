-- Enable web search for seeded scenarios
UPDATE "Scenario"
SET "partnerUseWebSearch" = true, "coachUseWebSearch" = true
WHERE "slug" IN ('angry-uncle-thanksgiving', 'difficult-coworker');
