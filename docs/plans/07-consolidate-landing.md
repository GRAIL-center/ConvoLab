# Plan: Consolidate Landing Page into React App

**Status**: Proposed (not yet implemented)

## Goal
Remove `packages/landing` (Astro) and integrate landing content into `packages/app` (React).

## Rationale
- Single placeholder page doesn't justify separate SSG framework
- Simplifies deployment (one frontend origin)
- Reduces cognitive overhead and build complexity
- Can revisit Astro if/when a content-heavy marketing site is actually needed

## Current State
- `packages/app/src/App.tsx` has `BrowserRouter` but no routes — just renders a single shell
- No `pages/` directory exists yet
- `packages/landing/` contains one Astro page with a simple hero section
- `pnpm-workspace.yaml` uses `packages/*` glob (no explicit listing needed)

## Changes

### 1. Add React Router Routes
**File**: `packages/app/src/App.tsx`

Add route structure:
- `/` → Landing page (public marketing hero)
- `/app` → Main app shell (the current content with UserMenu, etc.)

```tsx
import { Routes, Route } from 'react-router-dom';

// In App component:
<Routes>
  <Route path="/" element={<Landing />} />
  <Route path="/app/*" element={<AppShell />} />
</Routes>
```

### 2. Extract Components
**File**: `packages/app/src/App.tsx`

- Extract current app shell content into `AppShell` component (inline, same file)
- Add `Landing` component with hero content from Astro page (inline, same file)

Landing content to port:
- Title: "Conversation Coach"
- Description: "Practice difficult conversations with AI-powered role-play and real-time coaching."
- CTA buttons: "Get started" → `/app`, "Browse scenarios" → `/app/scenarios`

### 3. Delete Landing Package
```bash
rm -rf packages/landing
```

Workspace will auto-exclude it (glob pattern).

### 4. Update CLAUDE.md
Remove `landing/` from monorepo structure diagram.

## Files to Modify
- `packages/app/src/App.tsx` — add routes, Landing component, extract AppShell
- `packages/landing/` — delete directory
- `CLAUDE.md` — update monorepo docs

## Notes
- No new files needed — keeping it simple with inline components
- Can extract to separate files later if landing page grows
- SEO: React SPA won't have SSR, but that's fine for invitation-based user testing
- Tailwind 4 upgrade becomes simpler with one fewer package to migrate
