# Phase 8: Runtime Model Discovery

Decouple model selection from deployments. New models become available without code changes.

## Why This Matters

- Model releases are frequent (monthly+)
- Pricing changes without warning
- Models get deprecated
- Want to experiment with new models easily
- Different scenarios may want different cost/quality tradeoffs

## Core Concept

Instead of hardcoding `claude-sonnet-4-5-20250929` in scenarios, reference abstract tiers:

```typescript
// Scenario config
{
  partnerModel: { tier: "fast", provider: "any" },
  coachModel: { tier: "smart", preferProvider: "anthropic" }
}
```

Runtime resolves to actual model IDs based on current availability and preferences.

## Sketch of Implementation

### 1. Model Registry Table

```prisma
model LLMModel {
  id            String   @id  // "anthropic:claude-haiku-4-5"
  provider      String        // "anthropic"
  modelId       String        // "claude-haiku-4-5"
  displayName   String        // "Claude Haiku 4.5"
  tier          String?       // "fast" | "balanced" | "smart" | "premium"

  inputPrice    Decimal?      // per 1M tokens
  outputPrice   Decimal?      // per 1M tokens
  contextWindow Int?

  isActive      Boolean  @default(true)
  isDefault     Boolean  @default(false)  // default for its tier

  lastSyncedAt  DateTime
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### 2. Sync Job

Periodic task (daily? hourly?) that:
1. Calls each provider's model list API
2. Upserts into LLMModel table
3. Marks missing models as inactive
4. Alerts if a model in active use disappears

### 3. Tier Resolution

```typescript
function resolveModel(spec: ModelSpec): string {
  // Find active models matching tier + provider preferences
  // Pick based on: isDefault, price, recency, or random for A/B
}
```

### 4. Scenario Schema Change

```prisma
model Scenario {
  // Old: partnerModel String
  // New:
  partnerModelSpec  Json  // { tier: "fast" } or { exact: "anthropic:claude-haiku-4-5" }
  coachModelSpec    Json
}
```

## Open Questions

### Tier Definitions
- What tiers make sense? `fast/balanced/smart/premium`? Or `cheap/standard/best`?
- Should tiers be per-provider or cross-provider?
- How do we compare models across providers? (Haiku vs GPT-4o-mini vs Gemini Flash)
- Do we need capability tiers too? (vision, long-context, tool-use)

### Pricing & Cost Control
- Track real-time pricing from APIs, or maintain manually?
- Auto-switch to cheaper model if quota running low?
- Cost caps per session/invitation beyond token quotas?
- Show estimated cost before starting a conversation?

### Model Quality & Behavior
- Same tier across providers may behave very differently
- How do we validate a new model works for our prompts?
- A/B testing framework for comparing models?
- Prompt adjustments needed per model? (Claude vs GPT style differences)

### Sync Mechanics
- How often to sync? Hourly seems excessive, daily might miss urgent deprecations
- Webhook from providers for model changes? (probably don't exist)
- Manual trigger for "check for new models now"?
- How to handle sync failures gracefully?

### Admin Experience
- UI for managing tier assignments?
- Preview/test a model before enabling?
- Override tier for specific scenarios?
- Audit log of model changes?

### Migration & Backwards Compatibility
- Existing scenarios have hardcoded model strings
- Migrate to ModelSpec, or support both forever?
- What if a hardcoded model ID no longer exists?

### Provider-Specific Quirks
- Anthropic: aliases vs dated versions
- OpenAI: fine-tuned models show up in list
- Google: different API versions (v1 vs v1beta)
- Rate limits vary by model - factor into selection?

### Future Providers
- Ollama for local/self-hosted?
- AWS Bedrock / Azure OpenAI for enterprise?
- OpenRouter as a meta-provider?
- How pluggable should the provider system be?

### Observability
- Track which models are actually being used
- Latency/error rates per model
- Cost analytics dashboard
- Alerts for model degradation?

## Not In Scope (Yet)

- Fine-tuning our own models
- Prompt optimization per model
- Automatic model selection based on conversation content
- Multi-model routing within a single response

## Dependencies

- Phase 3b (streaming) - need working provider abstraction first ✓
- User testing feedback - what model behaviors matter most?

## When To Build This

After initial user testing. We'll have better intuition about:
- Which models work well for partner vs coach roles
- Whether cross-provider switching matters
- Actual cost patterns from real usage
