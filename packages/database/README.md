# Database Package

Shared Firestore data shim, model types, and seed helpers for the Conversation Coach monorepo.

## Current State

Runtime data is stored in Cloud Firestore. The exported `prisma` object in `index.ts` is a Prisma-shaped Firestore shim so the API can keep using calls such as `prisma.user.findMany()` while the backend runs on Firestore.

The `prisma/` directory still exists temporarily as schema/type scaffolding. Do not delete it until the generated Prisma model types are replaced with local TypeScript interfaces.

## Runtime Configuration

The API needs a Firestore project ID:

```env
FIRESTORE_PROJECT_ID=your-firebase-project-id
```

For local development, authenticate with Application Default Credentials:

```bash
gcloud auth application-default login
```

Docker development mounts your local gcloud credentials into the API container and sets:

```env
GOOGLE_APPLICATION_CREDENTIALS=/root/.config/gcloud/application_default_credentials.json
```

## Common Commands

Build the database package:

```bash
pnpm -F @workspace/database build
```

Run Firestore shim tests:

```bash
pnpm -F @workspace/database test
```

Generate Prisma artifacts when schema-derived types need refreshing:

```bash
pnpm -F @workspace/database generate
```

Seed reference data into the configured Firestore project:

```bash
pnpm -F @workspace/database seed
```

## Tests

Unit tests use in-memory fake Firestore and do not touch Cloud Firestore, Cloud SQL, or local Postgres.

API tests also run against fake Firestore through `packages/api/src/__tests__/setup.ts`.

## Testing Real Firestore

For local smoke testing against the Firebase project, set `FIRESTORE_PROJECT_ID`
in `.env` and authenticate with Application Default Credentials. If you are
testing Gemini through Vertex AI, also set `GOOGLE_CLOUD_PROJECT` and
`GOOGLE_CLOUD_LOCATION`:

```bash
gcloud auth application-default login
pnpm dev
```

You do not set a database URL. The Firestore client uses the project ID and
your Google credentials. Vertex AI uses the same credentials when
`GOOGLE_CLOUD_PROJECT` is set.

Use a dev/test Firebase project when possible. Smoke-test the app flows through
the UI or API rather than running unit tests against production data.

## Firestore Indexes

Composite indexes are declared in:

```text
firestore.indexes.json
```

Deploy them with the Firebase CLI from the repo root:

```bash
npx -y firebase-tools@latest deploy --only firestore:indexes --project convolab-490517
```

Deploy these before production or larger user testing. Some local-dev reads sort
small result sets in memory to avoid blocking on index build time, but growing
usage should rely on Firestore-side indexes.

## Legacy Prisma Files

These files are still present but are not the runtime database:

- `prisma/schema.prisma`
- `prisma/migrations/`
- `prisma.config.ts`

Keep them until the project no longer imports Prisma-generated model types.
