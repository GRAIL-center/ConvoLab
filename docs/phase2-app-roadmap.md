# Phase 2 roadmap: mobile app, app stores, and voice

Status: planning document, decided with Hanna 29–30 Sep 2026. **Nothing here
starts before the pilot RCT is fielded and the prompt/model freeze lifts.**
The pilot stays text-only and desktop-gated (PAP 3.1, PR #119); none of this
work may touch `/pilot` or `/study`.

Owners for the app-store research: Andrew and Rohan. Questions and updates:
edit this file by PR, like any other doc in `docs/`.

## Where we landed

Three paths were considered for getting ConvoLab onto phones and into the
stores. Decision: do them in this order, stopping when the benefit is met.

1. **Mobile web polish + PWA (first, cheap).** Finish the phone experience
   PR #114 started, then add a web app manifest, icons, and a service worker
   so the site is installable from the browser ("Add to Home Screen").
   Days of work, no store review, no rewrite. On Android, the same PWA can
   be published to Google Play via Google's Bubblewrap tool. Apple does not
   accept that shortcut.
2. **Capacitor wrapper (second, when voice justifies it).** Wrap the
   existing React app in a native shell for both stores. Realistically 2–4
   weeks, and most of the work is requirements around the code, not UI
   (see checklist below).
3. **Native rewrite (rejected).** Not worth it for a chat app.

## Voice (Gemini) — design decisions already taken

- **Transcribe and discard audio; do not store recordings.** A voice
  identifies the speaker, so stored audio would kill any anonymity claim
  and complicate IRB review, consent text, and store privacy labels.
- **Stay on Vertex.** The API calls Gemini with `vertexai: true`
  (`packages/api/src/llm/providers/google.ts`); under Google Cloud terms
  Vertex does not train on customer data, while AI Studio's free tier does.
  (Firestore is the database; Vertex is the LLM path. Both are current.)
- Real-time voice models are different models from the pinned partner/coach
  ones: budget for new model pinning and provenance work.
- Voice is also the strongest answer to Apple's "not just a website in a
  wrapper" rejection ground, and iOS Safari's audio handling is fiddly
  enough that voice pushes toward Capacitor rather than PWA on iOS.

## Auth and privacy model for the store version

- **Anonymous by default.** Sign-in is required only to save chats or
  create a custom persona. This matches Apple's rule against forcing login
  for features that don't need it, and makes "anonymous" an honest claim
  for the guest path.
- **Signed-in users are pseudonymized, not anonymized.** Identity lives in
  one `accounts` lookup table; transcripts are keyed to a random research
  ID; research exports never touch the identity table. Consent language:
  two honest tiers, "anonymous" (guests) and "confidential, pseudonymized"
  (accounts).
- **Abuse control replaces account quotas for guests:** device-level
  quotas plus reCAPTCHA-style checks, since anonymous users can't be
  quota'd by account. Store users are unrecruited traffic burning LLM
  spend; the quota design must hold before launch.
- **Account deletion:** in-app deletion (Apple requires it) removes the
  identity and linkable data, but the consent text will state that
  de-identified data already exported for research cannot be recalled.
  Decided 30 Sep so it is in the consent from the start.

## Store requirements checklist

Both stores:

- A new IRB protocol before app conversations become research data
  (presumably Harvard for Phase 2). A consent gate at first use (in the
  style of debunkbot.com) doubles as the required disclosure that
  conversation data goes to third-party AI providers; it must name
  Anthropic and Google.
- 18+ gate in-app and a matching store age rating (stores reach minors;
  the rating questionnaires now ask specifically about AI chat).
- Privacy labels / data-safety forms and a public privacy policy.
- Any "your data is not used to train AI models" claim must be verified
  against Vertex and Anthropic commercial API terms at the time of
  writing, and retention stated accurately. No blanket promises.
- OAuth does not work inside embedded webviews: the wrapped app needs
  native Google Sign-In or a system-browser login flow, and token-based
  sessions instead of the current cookie session.

Apple specifically:

- $99/yr developer account; should be a Harvard organization account, which
  requires a D-U-N-S number (free but slow to obtain — start early).
- Sign in with Apple required alongside Google on the sign-in path.
- In-app account deletion (covered above).
- The app must offer native value beyond the website (voice/microphone is
  our answer); pure webview wrappers are rejected under guideline 4.2.
- Explicit disclosure and consent before personal data goes to third-party
  AI (covered by the consent gate).

Google Play specifically:

- $25 one-time fee.
- New developer accounts must run a closed test (12 testers, 14 days)
  before public release.
- The Bubblewrap/PWA route is acceptable here even without Capacitor.

## Open research questions (Andrew & Rohan)

1. PWA baseline: what breaks today on iOS Safari and Android Chrome at
   phone width outside the flows PR #114 covered? Produce a page-by-page
   list.
2. Capacitor spike: wrap the current build, confirm the WebSocket
   connection and the login flow inside the shell, and document exactly
   what breaks (expected: cookie session and Google OAuth).
3. Auth migration design: token sessions + native/system-browser Google
   Sign-In + Sign in with Apple, coexisting with the current web cookie
   flow.
4. Guest-mode quota design: what does a device-level quota look like on
   Firestore, and what abuse signals do we have without an account?
5. Voice feasibility on Vertex: which live/real-time Gemini audio models
   are available on Vertex (not AI Studio), their pricing, and whether
   transcribe-and-discard is achievable end to end.
6. Timeline check on the Harvard D-U-N-S / Apple org account chain: who at
   Harvard owns this, and how long does it actually take?
