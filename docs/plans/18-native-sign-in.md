# Plan 18: Sign-in that works in the native app (mobile roadmap phase 2)

For Rohan and Brinda. Written 8 Oct 2026. Builds on phase 1 (PR #201, one
configurable API address, `packages/app/src/lib/apiUrl.ts`). Phase 3 (the
Capacitor app shell) comes after this and plugs into the placeholders described
below.

## Goal

The installed app cannot rely on the website's sign-in cookie: the app's pages
are served from `capacitor://localhost` (iOS) or `https://localhost` (Android),
a different origin from the API, and Google blocks sign-in inside an app's
built-in web view. So the app gets a **sign-in token** it sends with every
request, and Google sign-in happens in the phone's real browser and returns to
the app through a `convolab://` link.

## Ground rules

1. **The website does not change.** Cookie sign-in keeps working exactly as
   today. Everything here is a second path next to it. Test this explicitly
   (see Testing).
2. **Do not touch the study flow.** `/pilot` and `/study` are web-only and
   desktop-only for the research pilot, so `trpc/routers/study.ts` stays as it
   is. Anything that changes what a study participant sees needs Hanna's
   sign-off first.
3. **Never put a token in a URL.** URLs end up in Cloud Run request logs,
   browser history and analytics. The only thing that goes in a URL is the
   short-lived, single-use code described in step 4.
4. **Use the existing secret.** Derive the token signing key from
   `SESSION_KEY` (already in Secret Manager) rather than adding a new secret,
   for example HMAC-SHA256 over `"convolab-auth-token-v1"` with `SESSION_KEY`
   as key. Do not reuse `SESSION_KEY` bytes directly for a second purpose.

## How sign-in works today (read these first)

| What | Where |
|---|---|
| Cookie session (`@fastify/secure-session`, cookie `session`, 1 year guests / 90 days Google) | `packages/api/src/plugins/session.ts` |
| Google start route `/api/auth/google?next=` | `packages/api/src/plugins/oauth.ts` |
| Google callback, sets `userId` in the cookie, merges a guest into the Google account | `packages/api/src/routes/auth.ts`, `handleGoogleAuth` in `packages/api/src/auth/handlers.ts` |
| Logout (and "unclaim" for unused guest invitations) | `packages/api/src/routes/auth.ts` |
| tRPC reads the user from the cookie | `packages/api/src/trpc/context.ts` |
| Live conversation socket reads the user from the cookie | `packages/api/src/ws/handler.ts` (around line 24 and the auth check near 46) |
| Guests are created and stored in the cookie | `trpc/routers/practice.ts` (`practice.start`), `trpc/routers/invitation.ts` (claim). Also `study.ts`, which stays untouched |
| tRPC client (`credentials: 'include'`) | `packages/app/src/App.tsx`, `makeTRPCClient` |
| Socket clients | `packages/app/src/hooks/useConversationSocket.ts`, `useObserverSocket.ts` |

## The design, in build order

### Step 1. The token (server)

New `packages/api/src/lib/authToken.ts`:

- `issueAuthToken(userId, kind: 'guest' | 'account')` returns
  `base64url(payload) + "." + base64url(hmac)`, payload
  `{ v: 1, uid, kind, iat, exp }`. Lifetimes match the cookie: 365 days for
  guests, 90 days for accounts.
- `verifyAuthToken(token)` returns the user id or `null`. Constant-time
  signature comparison (`crypto.timingSafeEqual`), reject unknown `v`, reject
  expired.
- Known limitation, accepted for now: tokens are stateless, so signing out on a
  phone cannot cancel a token that has already been copied somewhere. Deleting
  the user makes it useless (the user lookup fails). If the commercial launch
  needs real revocation, add short-lived access tokens plus a refresh token
  later.

### Step 2. Accept the token on every request (server)

New helper `resolveUserId(request)`: if there is an
`Authorization: Bearer <token>` header and it verifies, use that user id;
otherwise fall back to the cookie session exactly as today. Use it in:

- `trpc/context.ts`
- `routes/auth.ts` logout (so the guest "unclaim" works for app users too)
- the socket handlers (step 3)

An invalid or expired bearer token must **not** silently fall back to the
cookie; treat it as signed out, so a stale app token cannot be masked.

### Step 3. The live conversation socket (server and client)

Browsers and app web views cannot add headers to a WebSocket. Send the token
as a WebSocket subprotocol instead of in the URL:

- Client: `new WebSocket(url, ['convolab.v1', 'bearer.' + token])`. Only do
  this when a token exists; the website keeps calling `new WebSocket(url)`.
- Server: register `@fastify/websocket` with `options.handleProtocols` that
  selects `convolab.v1` when it is offered (the handshake fails if the server
  does not echo one of the offered protocols), and read the `bearer.` entry
  from the `sec-websocket-protocol` request header in the handler. A browser
  that offers no protocols never reaches `handleProtocols`, so the website path
  is unchanged.
- Token characters must be valid in a subprotocol: base64url plus `.` is.

### Step 4. Guests in the app (server and client)

`practice.start` and the invitation claim create anonymous users and put them
in the cookie. When the request carries the header
`X-ConvoLab-Client: native`, also return `authToken` in the response. The
website never sends that header, so its responses do not change. (`study.ts`
is left alone: the study is web-only.)

### Step 5. Google sign-in from the app (server)

The standard pattern for native apps (OAuth with a one-time code and a PKCE
check, RFC 7636):

1. **App asks for a sign-in ticket.** `POST /api/auth/native/start` with body
   `{ codeChallenge }` (base64url SHA-256 of a random `codeVerifier` the app
   keeps in memory) and, if the app already has a guest token, that token in
   the `Authorization` header. The server stores a ticket
   `{ id, codeChallenge, guestUserId?, expiresAt: now + 10 min }` in a new
   Firestore collection (`authTickets`) and returns `{ ticketId }`.
2. **App opens the phone's browser** at
   `https://convolab.us/api/auth/google?native=<ticketId>`. The start route
   (`plugins/oauth.ts`) stores the ticket id in the browser's cookie session
   (like `authNext` today) and redirects to Google. Everything from here until
   the redirect back happens inside the phone's browser, so the cookie and the
   OAuth state cookie behave exactly as on the website.
3. **Google calls back** to the existing `/api/auth/google/callback`. If the
   session holds a native ticket id: load the ticket (reject if missing,
   expired or already used), call `handleGoogleAuth(userInfo,
   ticket.guestUserId, prisma)` so the guest's conversations merge into the
   account as they do on the web, then **do not** set the cookie. Instead
   create a one-time code `{ code, userId, codeChallenge, expiresAt: now + 2
   min, used: false }` (random, 32 bytes, base64url; collection `authCodes`)
   and redirect to `convolab://auth/callback?code=<code>`.
4. **App redeems the code.** `POST /api/auth/native/token` with
   `{ code, codeVerifier }`. The server checks the code exists, is unused and
   unexpired, and that `base64url(sha256(codeVerifier)) === codeChallenge`;
   marks it used **in a transaction** (so two simultaneous redemptions cannot
   both succeed); returns `{ authToken }` from step 1 with kind `account`.

Details that matter:

- The redirect target is fixed in config (`NATIVE_AUTH_REDIRECT`, default
  `convolab://auth/callback`). Never take it from the request, or the callback
  becomes an open redirect that hands codes to anyone.
- Clear the ticket id from the browser's cookie session in the callback either
  way, so a later website sign-in in the same browser is not treated as native.
- Errors in the native branch redirect to
  `convolab://auth/callback?error=<reason>` so the app can show a message.
- Delete expired tickets and codes (a scheduled cleanup or lazy deletion on
  read). Both collections hold no conversation data.

### Step 6. The app side (client)

- `packages/app/src/lib/authToken.ts`: get, set and clear the token. For now
  back it with `localStorage` behind a small interface; phase 3 swaps in
  secure native storage (Keychain / Keystore via a Capacitor plugin).
- `isNativeApp()`: true when the bundle runs inside the app (for now, a build
  flag such as `VITE_NATIVE=1`; phase 3 can switch to Capacitor's own check).
- tRPC client (`App.tsx`): when native, add `Authorization: Bearer` and
  `X-ConvoLab-Client: native` headers and drop `credentials: 'include'`.
  When not native, nothing changes.
- Sockets: pass the subprotocols from step 3 when a token exists.
- Store `authToken` when `practice.start` or the invitation claim returns one.
- Sign-in button (native only): create a `codeVerifier`, call
  `/api/auth/native/start`, then call `openSystemBrowser(url)`. Sign-out
  (native): call logout with the bearer, then clear the token.
- **Placeholders for phase 3**, clearly marked `// PHASE 3:`:
  `openSystemBrowser(url)` (Capacitor Browser plugin) and the handler for the
  incoming `convolab://auth/callback` link (Capacitor App plugin `appUrlOpen`),
  which redeems the code with step 5.4 and stores the token.

## Testing

Unit tests (Vitest, `packages/api/src/__tests__` and next to the client code):

- Token: round trip; tampered payload rejected; tampered signature rejected;
  expired rejected; wrong version rejected.
- `resolveUserId`: bearer wins over cookie; invalid bearer means signed out,
  not cookie; no bearer falls back to cookie.
- Code exchange: right verifier succeeds once; second redemption fails; wrong
  verifier fails; expired code fails; expired or used ticket fails.
- Callback: native ticket redirects to the configured `convolab://` URL with a
  code and sets no cookie; without a ticket it behaves exactly as before.
- Guest merge: a guest's ticket carries its user id into `handleGoogleAuth`.

Manual checks on a local stack (the API on your machine with the Firestore
emulator, see the repo `CLAUDE.md`):

- **Website unchanged:** sign in with Google, start a public practice
  conversation as a guest, open a `/study?...` link at desktop width, and talk
  in each. All must work by cookie with no `Authorization` header in the
  network tab.
- **Token path:** with `VITE_NATIVE=1`, start a guest conversation and confirm
  requests carry the bearer and the socket connects with the subprotocol.
- **Socket refusal:** a socket with a wrong token is closed with
  `AUTH_FAILED`, same as a wrong cookie.

The full phone loop (browser opens, Google, back into the app) can only be
tested once phase 3 builds the app. Leave a short checklist for that in the PR.

## Out of scope here

Sign in with Apple, in-app account deletion and the reCAPTCHA replacement are
phase 4. Native secure storage and the deep-link plumbing are phase 3. Token
refresh and revocation are a later decision.

## Suggested split

- **Brinda:** steps 1 to 3 (token, `resolveUserId`, socket subprotocol) and
  their tests. These are self-contained and everything else depends on them.
- **Rohan:** steps 4 and 5 (guest tokens, the native Google flow, tickets and
  codes) and their tests, starting once step 1 is merged.
- **Both:** step 6, then the manual checks together.

Open one PR per step or pair of steps rather than one large PR, and ask for a
review that specifically checks ground rules 1 to 3.
