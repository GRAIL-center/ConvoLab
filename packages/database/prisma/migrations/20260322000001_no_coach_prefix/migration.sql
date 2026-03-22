-- Remove self-labeling from coach responses.
UPDATE "Scenario"
SET "coachSystemPrompt" = "coachSystemPrompt" || E'\n\nDo not begin your response with "COACH:" or any role label.'
WHERE "slug" IN ('angry-uncle-thanksgiving', 'difficult-coworker');
