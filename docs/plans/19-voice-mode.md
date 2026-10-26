# 19 — Voice mode (spoken partner, written coach)

Spoken partner via Gemini Live; the coach and LAPP stay written and unchanged. Text mode stays available throughout as the fallback.

## Architecture (pilot)

Direct Gemini Live. No Pipecat for now (it adds a Python service; revisit only if direct Live can't handle interruptions, transcript alignment or resumption).

```
browser ──audio──▶ Gemini Live          (ephemeral token, config locked server-side)
   │
   └── voice:exchange (WS) ──▶ ConvoLab ──▶ store once ──▶ coach + LAPP (as for typed turns)
```

1. Client calls tRPC `voice.startSession({ sessionId })` and gets a `VoiceSessionGrant`. The token is single-use and expires quickly, with model, voice, persona prompt, transcription and search set in it. No field mask is sent, so the Live session takes its whole setup from the token. (`lockAdditionalFields: []` builds a mask, and Gemini rejects any mask containing `tools`.) The conversation so far is rebuilt from Firestore into the system instruction, so reconnecting or switching between text and voice resumes from our record.
2. Client runs the Live session itself, with mic capture, playback and interruption handling.
3. When an exchange finishes, the client sends `{ type: 'voice:exchange', exchange }` on the existing `/ws/conversation/:id` socket. The server validates it, stores both turns in one transaction keyed by `exchangeId` (so a resend is a no-op), acks it, then runs coach/LAPP with the usual turn-1 gate.
4. **Re-transcription.** Gemini Live's input transcription is a separate, weaker recogniser than the native-audio model, so the partner often understands a sentence the transcript gets wrong. The client keeps each turn's mic audio (`voice/turnAudio.ts`, at most 90 s, silence trimmed to 400 ms either side of the speech). As soon as the participant has been quiet for 600 ms, without waiting for Gemini's turn detection, it sends the clip as `voice:transcribe` on the conversation socket. If they carry on talking, the turn is sent again when the partner starts answering. The server transcribes it with `VOICE_TRANSCRIBE_MODEL` (comma-separated list, tried in order; thinking minimal; `voice/transcribe.ts`). A model that fails is skipped for a while (10 min after a 429, 30 s otherwise). If one hasn't answered within 1.5 s, the next model races it. Each attempt is abandoned after 6 s. The defaults are spread across several models because on the free tier any one of them is often out of daily quota or overloaded, replies `voice:transcript` with a `transcriptId`, and keeps the text for that connection. The exchange carries the `transcriptId`, and the server stores **its own copy** of the text. Metadata records `transcriptSource` (`server` / `live` / `unverified`), `transcriptModel` and Live's `liveTranscript`. If transcription fails or takes more than 8 s after the reply ends, Live's text is used. Audio is passed to Gemini and not kept.
5. To reconnect, call `voice.startSession` again. Gemini's own session resumption is not used, because the client can't pass a resume handle into a token-locked setup.

## The contract (`packages/api/src/voice/contract.ts`)

Both tracks build against this file. Change it only by agreement.

- `deliveredText` is what the participant actually heard. It becomes the stored partner message and is what the coach, LAPP and DQI see. `generatedText`, `interrupted`, `playbackCompleted`, `playedMs` and client timings go in `metadata`.
- `exchangeId` is a client UUID, used as the idempotency key. Keep it for retries and never reuse it.
- Server replies are `voice:exchange:ack` (with `duplicate`) or `voice:exchange:rejected` (`retryable` is true only for `storage_failed`).
- `voice:status` sends operational events and is logged only. It never carries transcript text.

## Where things live

| Side | Files |
|---|---|
| Server (`voice-server` branch) | `packages/api/src/voice/*`, `data/voiceExchanges.ts`, `trpc/routers/voice.ts`, WS handling in `ws/conversation.ts`, `handler.ts` and `protocol.ts` |
| Browser (`voice-full` branch, on top of server) | `packages/app/src/voice/*`: `audio.ts` (16 kHz mic capture, 24 kHz playback), `exchangeAssembler.ts`, `deliveredText.ts`, `voiceController.ts` (Live events → exchanges, barge-in, reconnect, fallback), `geminiLive.ts` (lazy-loaded SDK), `useVoiceMode.ts`, `VoicePanel.tsx`. Also wired into `useConversationSocket.ts` (send, retry until acked, show on ack), `Conversation.tsx` and `MobileMessageInput.tsx` |

Voice is offered **only in non-study sessions** until the research team approves it as a condition. The mic button is hidden when `voice.available` is false, i.e. when there's no key.

Turn detection is Gemini's automatic VAD; there's no push-to-talk. Barge-in is handled two ways: on Gemini's `interrupted` event, and locally when the participant talks over audio that is still buffered after generation has finished.

## Known limits / open items

- **Delivered text is approximate.** Gemini's output transcription has no word timings, so the client has to estimate the heard prefix from audio played versus total. Agree the method before the pilot and record `playedMs`.
- **Transcripts.** A re-transcribed turn (`transcriptSource: server`) is the server's own text. A turn is client-asserted only when transcription failed (`live`) or the socket reconnected between transcribing and storing (`unverified`). The audio itself is still client-supplied; only the proxy route closes that.
- **Transcript display.** The participant's bubble shows dots while they speak and until the server text arrives, usually about 1.5 s after they stop (600 ms pause plus about 1 s for the call), often before the partner's reply starts; then the server text. The partner bubble shows dots while it speaks and its heard text when it ends.
- **Coach timing.** Coaching starts after the whole exchange arrives, not alongside the partner as it does for typed turns.
- **Quota.** Gemini Live usage isn't metered against invitation quotas (the server never sees usage). The quota check only blocks once a quota is already exhausted.
- **Heard end to end on 17 Oct 2026** (free-tier key, `gemini-2.5-flash-native-audio-preview-09-2025`), with headless Chrome feeding a TTS WAV as the mic. The transcript was exact, the reply audio was stored as heard, both turns were saved once with `totalMessages` 2, and coach and LAPP ran on turn 2. The free key has no quota for `gemini-3.1-flash-live-preview`. Free-tier data may be used by Google, so it's for testing only, never participants.
- **Turn detection ends on short pauses.** "Hi Ashley. [pause] I keep hearing..." became two turns. That is Gemini's default VAD. Tuning `realtimeInputConfig.automaticActivityDetection` (e.g. `silenceDurationMs`) trades cut-offs against latency. It's a study-affecting change: decide it and version it before the pilot.
- **Credentials.** Ephemeral tokens exist only on the Gemini Developer API. Set `GEMINI_LIVE_API_KEY` (falls back to `GOOGLE_AI_API_KEY`) even where text runs on Vertex. `VOICE_PARTNER_MODEL` overrides the default Live model; probe it first.
- **Voices** in `voice/voiceConfig.ts` (`Charon` male, `Kore` female, the same voice across ideologies) are placeholders until the research team approves them.
- **Partner-opens study variant.** The opener is already a stored text turn. Decide whether the client speaks it or only shows it.
- **Research decisions still open:** audio retention (default: none), transcript visibility (recommended: finalized turns only), coaching cadence, session length vs Live session limits, consent wording, and exclusion rules for disrupted exchanges.
