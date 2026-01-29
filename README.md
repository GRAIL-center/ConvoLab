# ConvoLab

**ConvoLab** is an AI-powered platform for practicing conversations. Developed by the [GRAIL Center](https://github.com/GRAIL-center), it allows users to engage in realistic dialogue simulations while receiving real-time coaching feedback.

## What is ConvoLab?

Many social skills—like having difficult conversations, giving feedback, or navigating conflict—are hard to practice in real life. ConvoLab creates a safe space to rehearse these interactions with AI.

The platform features **two AI roles working simultaneously**:

1. **Conversation Partner** – Plays the other person in your scenario (e.g., a frustrated coworker, a hesitant patient, a resistant student)
2. **Coach** – Observes the conversation and provides supportive guidance in real time

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
- **Session data & telemetry** – Collect interaction data for analysis
- **Token quotas** – Control usage per participant
- **Admin dashboard** – Manage users, scenarios, and access

## How It Works

When you start a practice session:

1. You choose or create a **scenario** (e.g., "Give constructive feedback to an underperforming team member")
2. The AI partner takes on the role you've defined
3. You converse naturally via text (voice coming soon)
4. The AI coach watches and offers guidance—either in real time or at key moments
5. After the session, you can review the conversation

The AI uses large language models (like those from Anthropic, OpenAI, or Google) to generate realistic, context-aware responses.

## Quick Start

```bash
docker compose up --build
```

Then open http://localhost:5173 — the app will guide you through configuration.

> After pulling new changes, use `docker compose up --build -V` to rebuild and reset volumes.

<details>
<summary>Alternative: configure first, then run</summary>

```bash
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
docker compose up --build
```

Or with [Task](https://taskfile.dev):
```bash
task setup    # Creates .env
task up:bg    # Start containers in background
```

</details>

See [QUICKSTART.md](./QUICKSTART.md) for detailed instructions including Google OAuth setup.

### Authentication

ConvoLab uses Google sign-in combined with an invitation system. Researchers can generate invite links to onboard participants without requiring manual account setup.

## Technical Details

<details>
<summary>Click to expand for developers</summary>

### Architecture

See [conversation-coach-architecture.md](./conversation-coach-architecture.md) for details.

**Stack:**
- **Backend:** Fastify 5 + tRPC 11 + WebSocket
- **Database:** PostgreSQL 17 + Prisma 7
- **Frontend:** Vite 7 + React 19 + TanStack Query 5
- **Landing:** Astro 5
- **Auth:** Google OAuth + invitation links
- **Monorepo:** pnpm workspaces
- **Linting:** Biome

### Project Structure

```
packages/
├── database/    # Prisma schema + types
├── api/         # Fastify server
├── app/         # React SPA
└── landing/     # Astro pages
docs/
└── plans/       # Implementation phases
```

### Useful Commands

Run `task --list` for all commands, or see [QUICKSTART.md](./QUICKSTART.md) for details.

</details>

## Implementation Status

### Done
- [x] Full-stack foundation (Docker, Prisma, tRPC, Google OAuth, auto-migrations)
- [x] Multi-provider LLM streaming (Anthropic, OpenAI, Google via WebSocket)
- [x] Invitation system (magic links with token quotas)
- [x] Conversation practice (dual AI partner + coach, custom scenarios)
- [x] Research tools (QR codes, live observation, notes, admin UI, telemetry)

### Roadmap
- [ ] Coach aside (private Q&A with coach mid-conversation)
- [ ] Voice integration
- [ ] Consolidate landing page into React app
- [ ] Runtime model discovery (dynamic model selection)

## Contributing

Use AI assistants freely. Rapid prototyping > perfect code. Multiple experimental implementations are welcome.

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Dev workflow
- [docs/plans/](./docs/plans/) - Implementation phases
