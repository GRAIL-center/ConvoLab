# ConvoLab

**ConvoLab** is an AI-powered platform for practicing conversations. Developed by the [GRAIL Center](https://github.com/GRAIL-center), it allows users to engage in realistic dialogue simulations while receiving real-time coaching feedback.

## What is ConvoLab?

Many social skills—like having difficult conversations across political divides—are hard to practice in real life. ConvoLab creates a safe space to rehearse these interactions with AI.

The platform runs **three AI roles simultaneously**:

1. **Conversation Partner** – Plays the other person in your scenario (e.g., a MAGA-aligned relative, a progressive colleague)
2. **Coach** – Observes the conversation and provides supportive guidance after each of your messages
3. **LAPP Scorer** – Rates each of your turns on four communication skills (Listen, Acknowledge, Pivot, Perspective) plus conversational tone, shown live as a radar chart

Think of it like a flight simulator for communication skills.

## Who is it for?

ConvoLab was designed with researchers and practitioners in mind:

- **Social scientists** studying communication, conflict resolution, or interpersonal dynamics
- **Trainers and educators** teaching negotiation, counseling, or difficult conversations

ConvoLab is also built as a **public good**. Our hope is to make this platform freely available to anyone who wants to become a better communicator. The overarching goal is to improve societal dialogue and reduce affective polarization—helping people engage more constructively across difference.

### Built for Research

ConvoLab includes features specifically designed for research contexts:

- **Custom scenarios** – Define your own conversation setups (roles, contexts, goals)
- **Observation mode** – Researchers can watch sessions in real time
- **QR code access** – Easily onboard study participants
- **LAPP skill scoring** – Real-time per-exchange scores on Listen, Acknowledge, Pivot, Perspective
- **Session data & telemetry** – Collect interaction data and conversation lifecycle events for analysis
- **Token quotas** – Control usage per participant
- **Feedback collection** – In-app 5-star ratings with admin view
- **Admin dashboard** – Manage users, scenarios, and access

## How It Works

The current focus is on **cross-partisan political conversations**—practicing how to talk with someone who holds opposing political views.

When you start a practice session:

1. You pick a **scenario**—a specific person and political context to practice with
2. The AI partner takes on that role and responds the way a real person might
3. You converse naturally via text
4. The **coach watches in real time** and offers guidance after each of your messages—noticing when you're getting defensive, missing a chance to connect, or doing something well. You can also ask the coach a private question mid-conversation (the "coach aside")
5. Your **LAPP score** updates live, showing how your communication skills develop across the conversation

The partner and coach see different views of the conversation by design: the partner only sees its own dialogue, while the coach sees everything—including its own prior feedback—so it can guide without parroting the partner.

The AI uses large language models from Google and Anthropic, with automatic fallback between providers and optional web-search grounding for current events.

## Quick Start

Docker local development uses the Firestore emulator by default, so it does not write to production Firestore.

```bash
cp .env.example .env   # add ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker compose up --build
```

Then open http://localhost:5173. The API auto-seeds an empty emulator with sample scenarios, and emulator data persists locally in `.firestore-emulator-data/`. If scenarios are missing, manually seed the emulator:

```bash
docker compose exec api sh -c "cd packages/database && pnpm seed"
```

Notes:
- The api container talks to `firestore-emulator:8080` for local data. `~/.config/gcloud` is still mounted for Google/Vertex flows when configured.
- Source is bind-mounted for hot reload, but changes in `packages/database` need `docker compose restart api`.
- After pulling new changes, use `docker compose up --build -V` to rebuild and reset volumes.
- [Task](https://taskfile.dev) (`brew install go-task/tap/go-task`) wraps common commands: `task --list`.

<details>
<summary>Google OAuth setup</summary>

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create/select a project
2. Navigate to **APIs & Services > Credentials**, click **Create Credentials > OAuth client ID**
3. If prompted, configure the OAuth consent screen first (External user type; add your email to test users)
4. Select **Web application** and configure:
   - **Authorized JavaScript origins:** `http://localhost:5173`
   - **Authorized redirect URIs:** `http://localhost:5173/api/auth/google/callback`
5. Copy the Client ID and Client Secret into `.env`

</details>

### Authentication

ConvoLab uses Google sign-in combined with an invitation system. Researchers can generate invite links (or QR codes) to onboard participants without requiring manual account setup. Participants start as anonymous users and can link a Google account later without losing session data.

## Technical Details

<details>
<summary>Click to expand for developers</summary>

### Architecture

See [conversation-coach-architecture.md](./conversation-coach-architecture.md) for details.

**Stack:**
- **Backend:** Fastify 5 + tRPC 11 + WebSocket
- **Database:** Cloud Firestore, accessed through a Prisma-shaped compatibility shim in `packages/database` (call sites still read like Prisma)
- **Frontend:** Vite 7 + React 19 + TanStack Query 5
- **Landing:** Astro 5
- **Auth:** Google OAuth + invitation links
- **Monitoring:** Sentry error tracking
- **Hosting:** Firebase / Cloud Run; Cloud Functions in `functions/`
- **Monorepo:** pnpm workspaces
- **Linting:** Biome

### Project Structure

```
packages/
├── database/    # Firestore client + Prisma-shaped shim + shared types
├── api/         # Fastify server (tRPC + WebSocket)
├── app/         # React SPA
└── landing/     # Astro pages
functions/       # Firebase Cloud Functions (plain JS, outside the workspace)
docs/
└── plans/       # Implementation phases
```

### Testing

Tests run against an in-memory `FakeFirestore` double—never against a real Firestore project:

```bash
pnpm -F @workspace/api test
```

CI runs the `vitest.safe` and `vitest.atomic` configs only.

</details>

## Implementation Status

### Done
- [x] Full-stack foundation (Docker, tRPC, Google OAuth, local Firestore emulator)
- [x] Firestore migration (Prisma-shaped shim, fake-Firestore test suite)
- [x] Multi-provider LLM streaming (Anthropic, Google via WebSocket, with fallback)
- [x] Web-search grounding for partner and coach
- [x] Invitation system (magic links with token quotas)
- [x] Conversation practice (partner + coach, custom scenarios)
- [x] LAPP real-time skill scoring panel (Listen, Acknowledge, Pivot, Perspective)
- [x] Coach aside (private Q&A with coach mid-conversation)
- [x] In-app feedback collection (5-star rating + admin view)
- [x] Research tools (QR codes, live observation, notes, admin UI, telemetry)
- [x] Consolidated landing page
- [x] Sentry error monitoring

### Roadmap
- [ ] Prompt management and opacity (researcher-configurable prompts)
- [ ] Runtime model discovery (dynamic model selection)
- [ ] Firestore-native data layer (retire the Prisma shim)

## Contributing

Use AI assistants freely. Rapid prototyping > perfect code. Multiple experimental implementations are welcome.

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Dev workflow
- [docs/plans/](./docs/plans/) - Implementation phases
