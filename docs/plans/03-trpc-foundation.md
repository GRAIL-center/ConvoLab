# Phase 3: tRPC Foundation

Context with user resolution + protected procedures.

## New Files

### packages/api/src/trpc/context.ts
- Create context from Fastify request
- Resolve user from session
- Export Context type

### packages/api/src/trpc/procedures.ts
- initTRPC with context
- publicProcedure (no auth required)
- protectedProcedure (requires user)
- adminProcedure (requires ADMIN role)

### packages/api/src/trpc/router.ts
- Combine all routers
- Export AppRouter type

### packages/api/src/trpc/routers/auth.ts
- me query (return current user)

### packages/api/src/trpc/routers/scenario.ts
- list query
- get query (by id)

## Modify

### packages/api/src/server.ts
- Register tRPC plugin at /trpc
- Pass context factory

### packages/api/package.json
- Add @trpc/server (already present, verify version)

## Frontend Setup

### packages/app/src/api/trpc.ts
- Create tRPC client
- Configure httpBatchLink

### packages/app/package.json
- Add @trpc/client @trpc/react-query

## Dependencies

- Phase 2 (session with user)
