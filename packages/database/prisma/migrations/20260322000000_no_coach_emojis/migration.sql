-- Append no-emoji constraint to coach system prompt.
UPDATE "Scenario"
SET "coachSystemPrompt" = "coachSystemPrompt" || E'\n\nDo not use emojis in your responses.'
WHERE "slug" IN ('angry-uncle-thanksgiving', 'difficult-coworker');
