# Phase 14: List Management Patterns

Cross-cutting patterns for managing long lists throughout the app: archiving, filtering, search, grouping, pagination.

## Status: Proposed

## Goals

1. **Archiving** - Soft-delete pattern with easy recovery
2. **Time-based grouping** - Visual organization by recency
3. **Search** - Simple text filtering across list items
4. **Tags** (Phase 2) - Researcher-defined labels for organizing work
5. **Saved filters** (Phase 2) - Named filter combinations
6. **Mobile-first** - Touch-friendly patterns that work on phones

## Design Principles

- **Progressive complexity** - Start simple, add features only when needed
- **No pagination until necessary** - YAGNI for <100 items per user
- **Tags over folders** - More flexible, multiple labels per item
- **Frontend grouping first** - Avoid schema changes when pure UI works

---

## Phase 1: Minimum Viable (Immediate Value)

### 1.1 Archiving

Add `archivedAt` field to archivable models.

**Schema changes:**

```prisma
model ConversationSession {
  // ... existing fields ...
  archivedAt DateTime?
}

model Scenario {
  // ... existing fields ...
  archivedAt DateTime?
}

model Invitation {
  // ... existing fields ...
  archivedAt DateTime?
}
```

**Query pattern:**

```typescript
// Default: exclude archived
const sessions = await prisma.conversationSession.findMany({
  where: { userId, archivedAt: null },
});

// With archived
const sessions = await prisma.conversationSession.findMany({
  where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
});
```

**UI pattern:**

- Toggle in list header: "Show archived" (off by default)
- Archived items shown with muted styling + "Archived" badge
- Swipe-left to archive on mobile (confirm dialog)
- "Unarchive" action in item menu

### 1.2 Time-Based Grouping

Pure frontend - no schema changes.

**Groups:**
- Today
- Yesterday
- This Week
- This Month
- Older

**Implementation:**

```typescript
function groupByTime<T extends { createdAt: Date }>(items: T[]) {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = subDays(today, 1);
  const weekAgo = subDays(today, 7);
  const monthAgo = subMonths(today, 1);

  return {
    today: items.filter(i => i.createdAt >= today),
    yesterday: items.filter(i => i.createdAt >= yesterday && i.createdAt < today),
    thisWeek: items.filter(i => i.createdAt >= weekAgo && i.createdAt < yesterday),
    thisMonth: items.filter(i => i.createdAt >= monthAgo && i.createdAt < weekAgo),
    older: items.filter(i => i.createdAt < monthAgo),
  };
}
```

**UI pattern:**
- Collapsible sections with item counts
- Empty sections hidden
- Sticky section headers on scroll

### 1.3 Simple Search

Client-side filtering for small lists; add server-side when needed.

**UI pattern:**
- Search input at top of list (sticky on mobile)
- Debounced filtering (300ms)
- Highlights matching text in results
- "No results" empty state with clear button

**Client-side (Phase 1):**

```typescript
const filtered = items.filter(item =>
  item.name.toLowerCase().includes(query.toLowerCase()) ||
  item.description?.toLowerCase().includes(query.toLowerCase())
);
```

**Server-side (when needed):**

```typescript
// tRPC procedure
list: staffProcedure
  .input(z.object({ search: z.string().optional() }))
  .query(async ({ input }) => {
    return prisma.scenario.findMany({
      where: input.search ? {
        OR: [
          { name: { contains: input.search, mode: 'insensitive' } },
          { description: { contains: input.search, mode: 'insensitive' } },
        ],
      } : undefined,
    });
  });
```

---

## Phase 2: Researcher Workflow (When Requested)

### 2.1 Tags

Flexible labeling system for organizing research artifacts.

**Schema:**

```prisma
model Tag {
  id     String @id @default(cuid())
  name   String
  color  String? // Tailwind color name: "blue", "green", etc.
  userId String
  user   User   @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())

  scenarios    ScenarioTag[]
  invitations  InvitationTag[]
  sessions     SessionTag[]

  @@unique([userId, name])
  @@index([userId])
}

model ScenarioTag {
  scenarioId Int
  scenario   Scenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  tagId      String
  tag        Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([scenarioId, tagId])
}

model InvitationTag {
  invitationId String
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  tagId        String
  tag          Tag        @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([invitationId, tagId])
}

model SessionTag {
  sessionId Int
  session   ConversationSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  tagId     String
  tag       Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([sessionId, tagId])
}
```

**UI patterns:**
- Tag pills with color dots
- Click to filter by tag
- Multi-select tag filter (AND/OR toggle)
- Inline tag editing: click "+ Tag" to add
- Tag management page: create, rename, delete, merge

### 2.2 Saved Filters

Persist complex filter combinations as named views.

**Schema:**

```prisma
model SavedFilter {
  id     String @id @default(cuid())
  name   String
  userId String
  user   User   @relation(fields: [userId], references: [id])

  // Which entity type this filter applies to
  entityType String // "scenario" | "invitation" | "session"

  // Filter criteria as JSON
  criteria Json
  // Example: { tagIds: ["abc", "def"], archived: false, search: "pilot" }

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, entityType, name])
  @@index([userId, entityType])
}
```

**UI patterns:**
- "Save current filter" button when filters active
- Saved filters in sidebar or dropdown
- Edit/delete saved filters
- Share filters with team (future: make public to org)

---

## Phase 3: Scale (Probably Never Needed)

### 3.1 Cursor Pagination

Only implement if lists exceed ~100 items.

**tRPC pattern:**

```typescript
list: staffProcedure
  .input(z.object({
    cursor: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
  }))
  .query(async ({ input }) => {
    const items = await prisma.scenario.findMany({
      take: input.limit + 1,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > input.limit;
    return {
      items: hasMore ? items.slice(0, -1) : items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  });
```

**Frontend:**
- Infinite scroll with intersection observer
- Or "Load more" button (simpler, more accessible)

### 3.2 Full-Text Search

Only if searching conversation content becomes necessary.

**PostgreSQL approach:**

```sql
ALTER TABLE "Message" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX message_search_idx ON "Message" USING GIN (searchVector);
```

```typescript
// Raw query for full-text search
const results = await prisma.$queryRaw`
  SELECT * FROM "Message"
  WHERE "searchVector" @@ plainto_tsquery('english', ${query})
  ORDER BY ts_rank("searchVector", plainto_tsquery('english', ${query})) DESC
  LIMIT 20
`;
```

---

## Mobile Patterns

| Pattern | Implementation |
|---------|----------------|
| Swipe actions | `@use-gesture/react` for swipe detection |
| Pull to refresh | Native scroll + `refetch()` on overscroll |
| Bottom sheet filters | Radix Dialog with `modal` positioning |
| Sticky search | `position: sticky; top: 0` |
| Touch targets | Min 44x44px tap areas |
| Haptic feedback | `navigator.vibrate(10)` on actions |

**Swipe action pattern:**

```tsx
function SwipeableItem({ onArchive, children }) {
  const [offset, setOffset] = useState(0);
  const bind = useGesture({
    onDrag: ({ offset: [x] }) => setOffset(Math.min(0, x)),
    onDragEnd: ({ offset: [x] }) => {
      if (x < -100) onArchive();
      setOffset(0);
    },
  });

  return (
    <div {...bind()} style={{ transform: `translateX(${offset}px)` }}>
      {children}
    </div>
  );
}
```

---

## Implementation Order

### Immediate (Phase 1)
1. Add `archivedAt` to ConversationSession, Scenario, Invitation
2. Add archive/unarchive tRPC procedures
3. Add "Show archived" toggle to existing list UIs
4. Add swipe-to-archive gesture on mobile
5. Add time-based grouping to session/invitation lists
6. Add search input to scenario list

### When Requested (Phase 2)
7. Create Tag model and join tables
8. Add tag management UI
9. Add tag filtering to lists
10. Create SavedFilter model
11. Add "Save filter" functionality

### If Needed (Phase 3)
12. Add cursor pagination to high-volume lists
13. Add full-text search for message content

---

## Verification

### Phase 1 Testing

1. **Archive flow**
   - Archive an item via swipe (mobile) or menu action
   - Verify item disappears from default view
   - Toggle "Show archived"
   - Verify item reappears with archived badge
   - Unarchive item
   - Verify returns to normal view

2. **Time grouping**
   - Create items with different dates (use Prisma seed)
   - Verify correct grouping: Today, Yesterday, This Week, etc.
   - Verify empty groups are hidden
   - Verify counts are accurate

3. **Search**
   - Type in search box
   - Verify filtering happens after debounce
   - Verify matches highlighted
   - Clear search
   - Verify full list returns

### Mobile Testing
- Test at 375px width (iPhone SE)
- Test swipe gestures on real device
- Verify touch targets are 44px+
- Test with iOS Safari and Android Chrome

---

## Files to Modify

### Phase 1

| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Add `archivedAt` fields |
| `packages/api/src/routers/*.ts` | Add archive procedures, filter logic |
| `packages/app/src/components/` | Add `SwipeableListItem`, `TimeGroupedList`, `SearchInput` |
| `packages/app/src/pages/research/` | Integrate new patterns into existing lists |

### Phase 2

| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Add Tag, *Tag join tables, SavedFilter |
| `packages/api/src/routers/tag.ts` | New router for tag CRUD |
| `packages/api/src/routers/savedFilter.ts` | New router for saved filters |
| `packages/app/src/components/TagPill.tsx` | Tag display component |
| `packages/app/src/components/TagFilter.tsx` | Tag filter UI |
| `packages/app/src/pages/research/Tags.tsx` | Tag management page |

---

## Open Questions

1. **Shared vs personal tags?**
   Current design: tags are per-user. Could add `orgId` for shared team tags later.

2. **Archive vs delete?**
   Archive is soft-delete (recoverable). Add hard delete only if compliance requires it.

3. **Search across all entities?**
   Start with per-list search. Global search (scenarios + invitations + sessions) is a Phase 3 feature.
