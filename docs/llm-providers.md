# LLM Provider Reference

## Anthropic

### List Models
```bash
curl https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

SDK:
```typescript
const models = await anthropic.models.list();
```

Response includes `id`, `display_name`, `created_at`. Most recent models first, paginated via `has_more`.

### Model Naming
- Aliases (e.g., `claude-sonnet-4-5`) auto-update to newest snapshot
- Use dated versions for production (e.g., `claude-sonnet-4-5-20250929`)

Docs: https://docs.anthropic.com/en/docs/about-claude/models/overview

---

## OpenAI

### List Models
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

SDK:
```typescript
const models = await openai.models.list();
```

Response includes `id`, `created`, `owned_by`. Returns all models including fine-tunes.

### Model Naming
- No aliases; model IDs are stable (e.g., `gpt-4o-mini`, `gpt-4o`)
- Dated snapshots exist for some models (e.g., `gpt-4-0613`)

Docs: https://platform.openai.com/docs/models

---

## Google (Gemini)

### List Models
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_AI_API_KEY"
```

SDK:
```typescript
const genAI = new GoogleGenerativeAI(apiKey);
// No direct list method in JS SDK; use REST API or:
// https://ai.google.dev/api/models#method:-models.list
```

Response includes `name`, `displayName`, `description`, `inputTokenLimit`, `outputTokenLimit`.

### Model Naming
- Format: `models/gemini-2.0-flash` (REST) or `gemini-2.0-flash` (SDK)
- Versions: `gemini-2.0-flash-001`, `gemini-2.0-flash-latest`

Docs: https://ai.google.dev/gemini-api/docs/models/gemini

---

## Summary

| Provider | SDK Method | Key Fields |
|----------|-----------|------------|
| Anthropic | `anthropic.models.list()` | `id`, `display_name`, `created_at` |
| OpenAI | `openai.models.list()` | `id`, `created`, `owned_by` |
| Google | REST API only | `name`, `displayName`, `inputTokenLimit` |
