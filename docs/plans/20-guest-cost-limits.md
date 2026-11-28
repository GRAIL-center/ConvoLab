# Plan 20: Guest and account practice limits

Implemented in `packages/api/src/lib/practiceLimits.ts` and enforced by `practice.start` in `packages/api/src/trpc/routers/practice.ts`. Provider spending alerts stay a console setting.

The study flow (`/pilot`, `/study`, `trpc/routers/study.ts`) keeps its own cost model and is **not** subject to these caps. It does get two small, behaviour-preserving changes from this work: an IP rate limit on `study.enter` (shared with the other public routes, below), and, when the browser's cookie does not match the study session's owner, it now logs and switches to the session owner rather than failing — a participant who practiced or signed in first must never be locked out of their own study link.

## Why

Anyone can start a conversation as a guest, and every turn is a paid call to Anthropic or Google. Each guest (and each signed-in practice session) gets a **600,000-token** `public-practice` invitation (`packages/database/seed/seedDatabase.ts`). Without a server-side start limit, clearing a cookie or minting Google accounts remints that allowance. Ten people practicing a few times a week stays cheap (~$1–2 per full conversation); the expensive case is one person or a pile of new accounts starting chats all day.

## The rules

Checked on the server before a new session is created. Resuming a conversation already started does not count again. A conversation in progress keeps going until its own 600,000-token allowance ends.

| Who | Cap | What happens when full |
|-----|-----|------------------------|
| Signed-in Google account | **100** new practice conversations per UTC month, and **8** per UTC day | Plain message; no new AI session |
| Guest (no account) | **Five** free conversations per browser cookie (still behind reCAPTCHA) | Pressing Start reopens a session that still has allowance. After a chat's 600k tokens are spent, they can start another until five are used, then the screen asks them to sign in. Signing in keeps the conversations (merge in `auth/handlers.ts`) and then uses the account's 100 |
| Shared network | **30** brand-new guest starts per IP per UTC hour, and **15** per IP per UTC day | Pause on new free starts. Returning signed-in users are not counted, so a dorm is not locked out. The daily cap is below the site-wide 50 so one address cannot drain the whole day's allowance in a couple of hours |
| All guests together | **50** new guest conversations per UTC day | Cookie-clearing cannot mint more than that |

Counters live in Firestore and update inside a real `runTransaction` (not the Prisma-style `$transaction` shim). A counter is handed back (`releaseGuestPracticeStart`) if a start fails after the counter was bumped but before the session exists, so a crash mid-start does not silently burn a start:

- `practiceUsage/{userId}` — `monthKey`, `monthCount`, `dayKey`, `dayCount` (removed with the account on deletion, `accountDeletion.ts`)
- `guestSpend/{YYYY-MM-DD}` — `starts`
- `practiceIp/{YYYY-MM-DDTHH}__{hashedIp}` — `starts`, `expireAt`
- `practiceIpDay/{YYYY-MM-DD}__{hashedIp}` — `starts`, `expireAt`

The per-IP counters key on a **hash** of the address and never store the raw IP; each carries an `expireAt` for a Firestore TTL policy. Our privacy policy keeps IPs only in the 30-day Cloud logs, so these counters must not be a second durable copy.

The in-memory limiter in `packages/api/src/lib/ipRateLimit.ts` is for other public routes (`study.enter`, `feedback.submit`, `scenario.elaborate`). It is built on the same `createFixedWindowLimiter` as the native sign-in limit from #271, so it shares the IPv6 /64 grouping and the 50,000-key memory cap. It forgets its counts when Cloud Run starts another copy and is not this ceiling.

## What the person sees

`PracticeLanding` shows the server's `TRPCError.message` by the Start button:

- 8 today: "You've started 8 conversations today. Come back tomorrow."
- 100 this month: "You've started 100 conversations this month. They reset on the 1st."
- Guest allowance spent: "Sign in with Google to keep practicing."
- Guest day or network full: "Free practice is busy right now. Try again later, or sign in."

## Before enabling in production

- Add a Firestore **TTL policy** on the `expireAt` field for `practiceIp` and `practiceIpDay` so the hashed per-IP counters are swept automatically (the code sets `expireAt`; Firestore only deletes once a TTL policy exists for the collection).

## Out of scope here

- **App Check** for the phone app (issue #243): DeviceCheck / Play Integrity plus a keychain device id. The website cookie + daily guest ceiling covers the web hole for now.
- **Study 12-minute timer**: still client-only in `Conversation.tsx`; moving it server-side needs the study owner's sign-off.
- **Anthropic / Google Cloud spending alerts**: set in the consoles (email at 50%/80%, hard limit at 100%). Code cannot do it.

## Cost sense-check

About $1–2 per full conversation with the current partner/coach/scorer mix. Ten people doing two conversations a week is roughly $120/month. The caps above stop a single account or a farm of new guests from blowing past that without cutting anyone off mid-chat.
