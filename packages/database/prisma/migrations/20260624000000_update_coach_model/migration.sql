-- Update stale claude-sonnet-4-20250514 model ID to current claude-sonnet-4-6
UPDATE "Scenario"
SET "coachModel" = 'claude-sonnet-4-6'
WHERE "coachModel" = 'claude-sonnet-4-20250514';

UPDATE "Scenario"
SET "partnerModel" = 'claude-sonnet-4-6'
WHERE "partnerModel" = 'claude-sonnet-4-20250514';
