# Phase 2: Session & OAuth

Stateless encrypted sessions + Google OAuth.

## Package Changes

```bash
# Add
pnpm -F @workspace/api add @fastify/oauth2 @fastify/secure-session @fastify/cookie

# Remove
pnpm -F @workspace/api remove passport passport-local @node-saml/passport-saml bcrypt
pnpm -F @workspace/api remove -D @types/passport @types/passport-local @types/bcrypt
```

## New Files

### packages/api/src/plugins/session.ts
- Register @fastify/secure-session
- 7-day cookie maxAge
- Read SESSION_KEY from env

### packages/api/src/plugins/oauth.ts
- Register @fastify/oauth2 with Google preset
- Configure startRedirectPath, callbackUri
- Use OIDC discovery

### packages/api/src/routes/auth.ts
- GET /api/auth/google → redirect to Google
- GET /api/auth/google/callback → create/find user, set session
- POST /api/auth/logout → clear session
- GET /api/auth/me → return current user

## Modify

### packages/api/src/server.ts
- Import and register session plugin
- Import and register oauth plugin
- Import and register auth routes

## Env Vars Required

```env
SESSION_KEY=<64-char-hex>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

## Dependencies

- Phase 1 (User model with googleId)
