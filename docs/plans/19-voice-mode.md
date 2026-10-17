# 19 — Voice mode (spoken partner, written coach)

Spoken partner via Gemini Live; the coach and LAPP stay written and unchanged. Text mode stays available throughout as the fallback.

## Architecture (pilot)

Direct Gemini Live. No Pipecat for now (it adds a Python service; revisit only if direct Live can't handle interruptions, transcript alignment or resumption).

```
browser ──audio──▶ Gemini Live          (ephemeral token, config locked server-side)
   │
   └── voice:exchange (WS) ──▶ ConvoLab ──▶ store once ──▶ coach + LAPP (as for typed turns)
```

1. Client calls tRPC `voice.startSession({ sessionId })` and gets a `VoiceSessionGrant`. The token is single-use and expires quickly, with model, voice, persona prompt, transcription and search locked into it. The conversation so far is rebuilt from Firestore into the system instruction, so reconnecting or switching between text and voice resumes from our record.
2. Client runs the Live session itself, with mic capture, playback and interruption handling.
3. When an exchange finishes, the client sends `{ type: 'voice:exchange', exchange }` on the existing `/ws/conversation/:id` socket. The server validates it, stores both turns in one transaction keyed by `exchangeId` (so a resend is a no-op), acks it, then runs coach/LAPP with the usual turn-1 gate.
4. To reconnect, call `voice.startSession` again.

## The contract (`packages/api/src/voice/contract.ts`)

Both tracks build against this file. Change it only by agreement.

- `deliveredText` is what the participant actually heard. It becomes the stored partner message and is what the coach, LAPP and DQI see. `generatedText`, `interrupted`, `playbackCompleted`, `playedMs` and client timings go in `metadata`.
- `exchangeId` is a client UUID, used as the idempotency key. Keep it for retries and never reuse it.
- Server replies are `voice:exchange:ack` (with `duplicate`) or `voice:exchange:rejected` (`retryable` is true only for `storage_failed`).
- `voice:status` sends operational events and is logged only. It never carries transcript text.

## Work split (no shared files)

| Track | Owns | Status |
|---|---|---|
| **A — server** (`voice-server` branch) | everything under `packages/api/`: contract, grant endpoint, idempotent storage, WS handling, tests | done, needs real-key probe |
| **B — browser** | everything under `packages/app/`: `src/voice/*` (mic, Live client, playback, delivered-text tracking, retry queue), the voice UI, `useConversationSocket.ts` send/ack, mounting in `Conversation.tsx`, mic check, text fallback | not started |

Track B imports types only: `import type { VoiceExchange } from '@workspace/api/src/voice/contract'`. It needs `voice` on `AppRouter`, so merge A first or rebase B onto it.

## Known limits / open items

- **Delivered text is approximate.** Gemini's output transcription has no word timings, so the client has to estimate the heard prefix from audio played versus total. Agree the method before the pilot and record `playedMs`.
- **Transcripts are client-asserted.** In the direct route the browser reports what was said. The prompt, voice and model are locked, but the transcript text is not verifiable server-side. This is acceptable for a pilot; only the proxy route closes it.
- **Coach timing.** Coaching starts after the whole exchange arrives, not alongside the partner as it does for typed turns.
- **Quota.** Gemini Live usage isn't metered against invitation quotas (the server never sees usage). The quota check only blocks once a quota is already exhausted.
- **Credentials.** Ephemeral tokens exist only on the Gemini Developer API. Set `GEMINI_LIVE_API_KEY` (falls back to `GOOGLE_AI_API_KEY`) even where text runs on Vertex. `VOICE_PARTNER_MODEL` overrides the default Live model; probe it first.
- **Voices** in `voice/voiceConfig.ts` (`Charon` male, `Kore` female, the same voice across ideologies) are placeholders until the research team approves them.
- **Partner-opens study variant.** The opener is already a stored text turn. Decide whether the client speaks it or only shows it.
- **Research decisions still open:** audio retention (default: none), transcript visibility (recommended: finalized turns only), coaching cadence, session length vs Live session limits, consent wording, and exclusion rules for disrupted exchanges.
