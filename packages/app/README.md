# App Package

React 19 frontend application for the Conversation Coach platform.

## Overview

This is the main user-facing application built with:
- **React 19**: Modern concurrent features for smooth AI streaming
- **Vite 7**: Fast build tool and dev server
- **TanStack Query 5**: Server state management
- **tRPC 11**: Type-safe API client
- **React Router 7**: Client-side routing
- **Tailwind CSS**: Utility-first styling

## Project Structure

```
packages/app/src/
├── main.tsx           # React entry point
├── App.tsx            # Root component
├── trpc.ts            # tRPC client setup
├── components/        # React components (TODO)
│   ├── ConversationView.tsx
│   ├── MessageList.tsx
│   ├── ScenarioSelector.tsx
│   └── ...
├── pages/             # Route components (TODO)
│   ├── Home.tsx
│   ├── Conversation.tsx
│   └── ...
├── hooks/             # Custom React hooks (TODO)
│   ├── useConversationWebSocket.ts
│   └── useAuth.ts
└── contexts/          # React contexts (TODO)
    └── AuthContext.tsx
```

## Running the App

### In Docker (Recommended)

```bash
# Start all services
docker compose up

# View app logs
docker compose logs -f app

# Restart after code changes
docker compose restart app
```

The app runs on **http://localhost:5173**

### Locally

```bash
# Install dependencies (from root)
pnpm install

# Start dev server
pnpm -F @workspace/app dev
```

Hot module replacement (HMR) is enabled - changes appear instantly!

## Environment Variables

The app uses environment variables prefixed with `VITE_`:

```bash
# .env
VITE_API_URL=http://localhost:3000
```

Access in code:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

## Development

### Using tRPC

tRPC provides type-safe API calls with zero boilerplate:

```typescript
import { trpc } from '~/trpc';

function ScenarioList() {
  // Fully typed query with automatic caching
  const { data: scenarios, isLoading, error } = trpc.scenarios.list.useQuery();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {scenarios?.map((scenario) => (
        <div key={scenario.id}>
          {scenario.name}
          {/* TypeScript knows all fields! */}
        </div>
      ))}
    </div>
  );
}
```

No manual type definitions needed - types flow from the API automatically!

### Creating Components

```typescript
// src/components/ScenarioCard.tsx
import type { Scenario } from '@workspace/database';

interface ScenarioCardProps {
  scenario: Scenario;
  onSelect: (id: number) => void;
}

export function ScenarioCard({ scenario, onSelect }: ScenarioCardProps) {
  return (
    <div
      className="rounded-lg border p-4 hover:bg-gray-50 cursor-pointer"
      onClick={() => onSelect(scenario.id)}
    >
      <h3 className="text-lg font-semibold">{scenario.name}</h3>
      <p className="text-gray-600">{scenario.description}</p>
    </div>
  );
}
```

### WebSocket Connection (TODO)

For real-time AI streaming:

```typescript
// src/hooks/useConversationWebSocket.ts
import { useEffect, useState } from 'react';

export function useConversationWebSocket(sessionId: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [partnerStream, setPartnerStream] = useState('');
  const [coachStream, setCoachStream] = useState('');

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3000/ws/conversation/${sessionId}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'partner') {
        setPartnerStream((prev) => prev + data.content);
      } else if (data.type === 'coach') {
        setCoachStream((prev) => prev + data.content);
      }
    };

    return () => ws.close();
  }, [sessionId]);

  const sendMessage = (content: string) => {
    ws.send(JSON.stringify({ content }));
  };

  return { messages, partnerStream, coachStream, sendMessage };
}
```

### Routing (TODO)

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scenarios" element={<ScenarioList />} />
        <Route path="/conversation/:sessionId" element={<ConversationView />} />
      </Routes>
    </BrowserRouter>
  );
}
```

### Styling with Tailwind

This project uses Tailwind CSS. Common patterns:

```tsx
// Layout
<div className="container mx-auto px-4 py-8">

// Cards
<div className="rounded-lg border bg-white p-6 shadow-sm">

// Buttons
<button className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">

// Forms
<input
  className="rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
/>
```

## Installing Packages

```bash
# From root
pnpm -F @workspace/app add <package>

# In Docker
docker compose exec app pnpm -F @workspace/app add <package>
docker compose restart app
```

## Building for Production

```bash
# Build optimized bundle
pnpm -F @workspace/app build

# Preview production build
pnpm -F @workspace/app preview
```

Output goes to `dist/` directory.

## Key Features to Implement (TODO)

### 1. Authentication Flow

- Login page
- Session management
- Protected routes
- Auth context

### 2. Scenario Selection

- Browse available scenarios
- View scenario details
- Start new conversation

### 3. Conversation View

- Real-time message streaming
- Dual AI display (partner + coach)
- Message input
- Session controls (end conversation)

### 4. Session History

- View past conversations
- Replay conversations
- Export transcripts

### 5. User Profile

- View/edit profile
- Change password (email auth)
- Manage settings

## Type Safety

React 19 + TypeScript + tRPC provides end-to-end type safety:

```typescript
// Backend defines the API
export const scenariosRouter = router({
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return prisma.scenario.findUnique({ where: { id: input.id } });
    }),
});

// Frontend gets automatic types!
const { data } = trpc.scenarios.get.useQuery({ id: 1 });
//    ^? Scenario | null (TypeScript knows!)
```

Refactor the backend, frontend types update automatically!

## Performance Tips

### Code Splitting

Vite automatically splits code by route:

```typescript
import { lazy } from 'react';

const ConversationView = lazy(() => import('./pages/ConversationView'));
```

### React Query Caching

TanStack Query caches API responses automatically:

```typescript
// First call fetches from server
const { data } = trpc.scenarios.list.useQuery();

// Second call (within 5 minutes) uses cache
const { data } = trpc.scenarios.list.useQuery(); // Instant!
```

### Optimistic Updates

Update UI before server responds:

```typescript
const utils = trpc.useUtils();

const mutation = trpc.sessions.create.useMutation({
  onMutate: async (newSession) => {
    // Optimistically update cache
    utils.sessions.list.setData(undefined, (old) => [...old, newSession]);
  },
});
```

## Troubleshooting

### "Module not found" errors

Clear Vite cache:

```bash
rm -rf node_modules/.vite
docker compose restart app
```

### Changes not appearing

Check Vite dev server is running:

```bash
docker compose logs app
```

Restart if needed:

```bash
docker compose restart app
```

### Type errors after API changes

Regenerate Prisma client:

```bash
pnpm -F @workspace/database generate
docker compose restart app
```

### WebSocket connection failed

Ensure API server is running:

```bash
curl http://localhost:3000/health
```

## Testing (TODO)

```bash
# Run tests
pnpm -F @workspace/app test

# In Docker
docker compose exec app pnpm test
```

## Resources

- [React 19 Docs](https://react.dev/)
- [Vite Documentation](https://vite.dev/)
- [TanStack Query](https://tanstack.com/query/latest)
- [tRPC React](https://trpc.io/docs/client/react)
- [React Router](https://reactrouter.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## UI/UX Considerations

### Conversation Design

- Show partner and coach responses side-by-side
- Stream text character-by-character for natural feel
- Indicate when AI is "thinking"
- Allow users to pause/resume conversation

### Accessibility

- Use semantic HTML
- Add ARIA labels for screen readers
- Ensure keyboard navigation works
- Maintain good color contrast

### Mobile Responsiveness

Tailwind makes responsive design easy:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {/* Stacks on mobile, 2 columns on tablet, 3 on desktop */}
</div>
```

## Experiment & Iterate!

Don't be afraid to try different approaches:
- Multiple implementations of the same feature
- Different state management patterns
- Various UI layouts

**Disposable prototypes are valuable** - build quickly, learn, and iterate!

See [conversation-coach-architecture.md](../../conversation-coach-architecture.md) for overall system design.
