# Phase 5: Frontend Auth

Auth context + login flow.

## New Files

### packages/app/src/contexts/AuthContext.tsx
```typescript
interface AuthState {
  user: User | null;
  invitation: Invitation | null;
  isLoading: boolean;
  login: () => void;      // redirect to /api/auth/google
  logout: () => Promise<void>;
}
```
- Fetch /api/auth/me on mount
- Store in TanStack Query cache
- Provide login/logout functions

### packages/app/src/pages/Login.tsx
- "Sign in with Google" button
- Handle ?error=auth_failed query param
- Redirect if already logged in

### packages/app/src/components/UserMenu.tsx
- Show avatar + name
- Logout button
- Link to profile (future)

## Modify

### packages/app/src/App.tsx
- Wrap with AuthProvider
- Add /login route
- Protected route wrapper component

### packages/app/src/main.tsx
- Ensure QueryClientProvider wraps AuthProvider

## Route Structure

```
/                → Scenario list (protected or invitation)
/login           → Login page
/invite/:token   → Invitation landing
/conversation/:id → Chat UI (protected or invitation)
```

## Dependencies

- Phase 2 (OAuth endpoints)
- Phase 3 (tRPC client)
