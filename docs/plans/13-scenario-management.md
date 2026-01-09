# Phase 13: Scenario Management for Researchers

Enable researchers to create, edit, and manage conversation scenarios through a mobile-friendly UI.

## Status: Proposed

## Goals

1. **Scenario CRUD** - Create, edit, clone scenarios via UI (no more seed-file-only)
2. **Freezing** - Manual freeze action to preserve research integrity
3. **Lineage tracking** - Know which scenarios were cloned from which
4. **Foundation** - Set up for future versioning, model categories, A/B testing

## Design Principles

- **Mobile-first** - Researchers may manage scenarios from phones during field testing
- **Research integrity** - Once shared externally, scenarios should be immutable
- **Minimal first** - CRUD + freeze now; versioning/evals/A/B later

---

## Entity Model

### Scenario (evolve existing)

Current fields remain, plus:

| Field | Type | Purpose |
|-------|------|---------|
| `isFrozen` | Boolean | Once true, scenario cannot be edited |
| `createdById` | String? | User who created this scenario |
| `clonedFromId` | Int? | Parent scenario if cloned |

**Freezing rules:**
- Draft scenarios (unfrozen) can be freely edited
- Researcher manually freezes when ready to share
- Frozen scenarios cannot be edited - must clone to iterate
- Invitations to non-staff users require frozen scenarios

**Why manual freeze (not auto-freeze on claim)?**
- Gives researcher explicit control over when to "lock in"
- Allows staff-to-staff testing without freezing
- Clear mental model: "freeze before sharing externally"

### Model Strategy: Pinning Now, Categories Later

Current model fields (`partnerModel`, `coachModel`) are **pinned models** - exact model strings that provide reproducibility for research.

**Why this works:**
- Researchers specify exact model (e.g., `"claude-sonnet-4-20250514"`)
- `UsageLog` captures what actually ran (audit trail)
- Frozen scenarios preserve the exact configuration used

**Future evolution (Phase 13c):**
```prisma
model Scenario {
  partnerModel           String   // Pinned (always set, used as fallback)
  coachModel             String   // Pinned (always set, used as fallback)
  partnerModelCategoryId String?  // Optional: resolve dynamically
  coachModelCategoryId   String?  // Optional: resolve dynamically
}
```

**Runtime logic (future):**
- If category set → resolve to current best model in that category
- If no category → use pinned model (exact, reproducible)

This lets researchers choose: **pin for reproducibility** OR **use category for freshness**.

### Future Entities (not in this phase)

**PromptVersion** - Point-in-time snapshot of prompts
- Would enable "what exact prompts did participant X see?"
- Currently: sessions with predefined scenarios reference by FK, so if scenario is frozen, we know what they saw

**ModelCategory** - Abstract model slots
- "Fast Partner", "Thoughtful Coach" etc.
- Scenarios optionally reference categories instead of (or in addition to) pinned models
- Decouples prompt design from model churn
- Eval gates: models must pass criteria to join a category

**Experiment** - A/B testing framework
- Group prompt variants, define allocation
- Track which variant each session used
- Measure outcomes

---

## UI Pages

### Research Area Navigation

```
/research
├── /invitations          (existing)
│   └── /:id              (existing)
│
├── /scenarios            (NEW)
│   ├── /new              (NEW)
│   └── /:id/edit         (NEW)
│
└── (future: /models, /experiments)
```

### Scenario List (`/research/scenarios`)

**Layout:** Card list, sorted by status (drafts first, then frozen)

**Each card shows:**
- Name + partner persona preview
- Status badges: Draft (amber) / Frozen (blue) / Inactive (gray)
- Usage stats: X invitations, Y sessions
- Lineage: "Cloned from: Parent Name" if applicable

**Actions:**
- **Edit** (draft only) → navigate to edit page
- **Freeze** (draft only) → confirm dialog, then freeze
- **Clone** (any) → creates unfrozen copy, navigate to edit

**Header actions:**
- **New Scenario** button → navigate to create page

### Scenario Form (create + edit)

**Sections (collapsible on mobile):**

1. **Basic Info**
   - Name (text input)
   - Slug (text + auto-generate button)
   - Description (textarea, 3 rows)
   - Partner Persona (text input)

2. **System Prompts**
   - Partner System Prompt (textarea, 8+ rows, monospace)
   - Coach System Prompt (textarea, 8+ rows, monospace)
   - Character count shown below each

3. **Model Selection**
   - Partner Model (dropdown of known models)
   - Coach Model (dropdown of known models)
   - Can type custom model string if needed

4. **Status**
   - Active checkbox (controls visibility in public list)

**Frozen state:**
- All fields disabled
- Blue banner: "This scenario is frozen. Clone it to make changes."
- Only action: Clone button

---

## Schema Changes

```prisma
model Scenario {
  // ... existing fields ...

  isFrozen     Boolean  @default(false)

  createdById  String?
  createdBy    User?    @relation("CreatedScenarios", fields: [createdById], references: [id])

  clonedFromId Int?
  clonedFrom   Scenario?  @relation("ScenarioClones", fields: [clonedFromId], references: [id])
  clones       Scenario[] @relation("ScenarioClones")
}

model User {
  // ... existing fields ...
  scenariosCreated Scenario[] @relation("CreatedScenarios")
}
```

---

## API Changes

### New tRPC Procedures (scenario router)

| Procedure | Auth | Purpose |
|-----------|------|---------|
| `listAll` | staff | All scenarios with counts, for management UI |
| `getForEdit` | staff | Full scenario including prompts |
| `create` | staff | Create new scenario |
| `update` | staff | Update scenario (fails if frozen) |
| `freeze` | staff | Mark scenario as frozen |
| `clone` | staff | Create unfrozen copy |
| `getKnownModels` | staff | List of model options for dropdowns |

### Modified Procedures

**`invitation.create`** - Add validation:
- If `scenarioId` provided, scenario must be frozen
- Error: "Cannot create invitation for unfrozen scenario. Freeze it first."

---

## Frontend Components

### New Files

| File | Purpose |
|------|---------|
| `pages/research/ScenarioList.tsx` | List page with status/actions |
| `pages/research/ScenarioCreate.tsx` | Create page wrapper |
| `pages/research/ScenarioEdit.tsx` | Edit page wrapper |
| `components/research/ScenarioForm.tsx` | Shared form component |

### Modified Files

| File | Change |
|------|--------|
| `components/ResearchSidebar.tsx` | Add Scenarios nav item |
| `pages/research/InvitationList.tsx` | Filter scenario dropdown to frozen only |
| `App.tsx` | Add scenario routes |

---

## Implementation Order

1. **Schema migration** - Add fields to Scenario, update User
2. **Backend procedures** - Implement tRPC procedures
3. **ScenarioForm component** - Shared form with all sections
4. **ScenarioList page** - List with status badges and actions
5. **ScenarioCreate page** - Create flow
6. **ScenarioEdit page** - Edit flow with frozen handling
7. **Routes + sidebar** - Wire up navigation
8. **Invitation validation** - Enforce frozen requirement
9. **Seed file update** - Mark existing scenarios as frozen

---

## Verification

### Manual Testing

1. **Create scenario**
   - Navigate to /research/scenarios
   - Click "New Scenario", fill form, save
   - Verify appears in list as Draft

2. **Edit scenario**
   - Click Edit on draft scenario
   - Modify fields, save
   - Verify changes persist

3. **Freeze scenario**
   - Click Freeze on draft scenario
   - Verify status changes to Frozen
   - Verify Edit button disappears, form is disabled

4. **Clone scenario**
   - Click Clone on frozen scenario
   - Verify new draft created with "(Copy)" suffix
   - Verify clonedFrom shows parent name

5. **Invitation enforcement**
   - Try to create invitation with unfrozen scenario
   - Verify error message
   - Freeze scenario, retry
   - Verify invitation creates successfully

### Mobile Testing

- Test all pages at 375px width (iPhone SE)
- Verify form sections are readable
- Verify action buttons are tappable
- Verify long prompts scroll properly

---

## Future Phases (not in scope)

### Phase 13b: Prompt Versioning
- Track prompt changes over time
- See history of edits before freeze
- Compare versions side-by-side

### Phase 13c: Model Categories
- Abstract model slots (Fast Partner, Smart Coach)
- Map specific models to categories
- Scenarios reference categories, not model strings
- Eval gates for qualifying new models

### Phase 13d: A/B Testing
- Create experiments with multiple variants
- Define allocation percentages
- Link invitations to experiments
- Track outcomes per variant

---

## Open Questions (resolved)

1. **Q: Auto-freeze vs manual freeze?**
   A: Manual - gives researcher explicit control

2. **Q: How to handle model specification?**
   A: Current strings = pinned models (reproducible). Add optional category references in Phase 13c. Researchers can choose pin vs category per scenario.

3. **Q: Versioning in this phase?**
   A: No - freezing provides basic integrity; versioning comes later
