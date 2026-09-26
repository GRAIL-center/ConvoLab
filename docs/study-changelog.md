# Study behaviour changelog

Dated record of every change that altered what a **participant experienced**,
kept so pilot and RCT sessions can be classified rather than reconstructed from
git later. Times are UTC.

Two mechanisms deliver changes, and they land at different moments:

- **Code** reaches participants when a Cloud Run revision starts serving.
- **Prompts** live in Firestore scenario documents and reach participants only
  after a `seed:reference` run — a deploy alone does nothing for them.

Both apply to **new sessions only**. A session stamps its partner and coach
prompts into its own record at creation (`customPartnerPrompt`,
`customCoachPrompt`, `customScenarioName`), so conversations already in flight
keep whatever they started with.

---

## 2026-09-25 — partner runtime prompt: date is now the real date; reply-length policy covered by tests (code only, not yet live)

- **Wrong date since the fact block was added.** The partner's runtime fact
  block said "Today is August 6, 2026" as fixed text from the day it was
  added, so every conversation since then told the partner the wrong date.
  That matters whenever the partner reasons about current events or uses web
  search. It now carries the actual date (UTC) at the time of each reply,
  built by `buildFactContext()` in `packages/api/src/lib/partnerRuntimePrompt.ts`.
  The coach's insight prompt, which reused the same block, gets the real date
  too. The other three lines of the block are unchanged.
- **Reply-length policy unchanged, now tested.** The policy text itself
  (`PARTNER_RESPONSE_POLICY`: most replies 1-3 sentences, never past 4) is
  unchanged. It moved verbatim from `ws/conversation.ts` into
  `lib/partnerRuntimePrompt.ts` so tests can reach it. The final partner prompt
  is built exactly as before.
- **Prompt-level check.** `packages/api/src/__tests__/partnerReplyLength.safe.test.ts`
  asserts that no seeded study or general-app persona (or study prompt) carries
  a competing sentence or paragraph length rule, that the policy appears exactly
  once and last in every final partner prompt with its 1-3 / max 4 wording, and
  that the appended block is byte-identical across both ideologies and both
  genders.
- **Output-level check.** `scripts/audit_reply_length.py` measures real replies
  from a de-identified export without printing any text. On the 36 real
  sessions in the 25 Sep production export, 79% of partner replies were within
  1-3 sentences overall (median 55 words), and 88% in the V3 period, which
  covers only 6 sessions.

---

## 2026-09-25 — sessions now record which models they ran on (provenance for the frozen configuration; code only, not yet live)

The pre-analysis plan pins the partner, coach and live-scorer models and
requires the archive to say which model produced each transcript. Until now no
session recorded a model. The export filled `partner_model` and `coach_model`
from the live `scenarios` record, so it reported today's configuration rather
than what ran, and for study sessions (which carry no `scenarioId`) it wrote
null for both.

- **What is stored.** At creation (`study.enter`) every study session now
  stores three model identifiers: `studyPartnerModel`, `studyCoachModel` and
  `studyScorerModel`. They are resolved by `packages/api/src/lib/modelResolution.ts`,
  the same function the WebSocket handler uses at runtime, so the snapshot is
  the model the handler would pick for that session.
- **Runtime prefers the snapshot.** When a session carries the snapshot, the
  partner, coach (insights and asides) and live scorer run on the stored models
  and the `usageLogs` rows record them, so a later configuration change cannot
  move a study session that is already in flight. Sessions without a snapshot
  resolve exactly as before. Each connect of a study session logs
  `study_models_resolved` with the three models.
- **The export prefers the snapshot and flags rows without it.** Every record
  now has `partner_model`, `coach_model`, a new `scorer_model`, and a boolean
  `models_from_snapshot`. When the snapshot is present all three model columns
  come from it and the flag is true. When it is absent the old fallback applies
  (the live scenario record, null for study sessions), `scorer_model` is null,
  and the flag is false. Only rows with the flag set are trustworthy provenance.
- **Older sessions.** Sessions created before this change have no snapshot.
  Their provenance is recoverable from the `usageLogs` collection, which holds
  the `model` for each `sessionId` and `streamType` (`partner`, `coach`,
  `aside`). The live scorer does not write usage rows, so for those sessions
  the scorer model has to be taken from the deployed configuration at the time.

No participant-facing change: the models a new study session runs on are the
same as before.

---

## 2026-09-25 — export: coaching-engagement columns (analysis tooling only, no participant-facing change)

The transcript export (`scripts/export_transcripts_firestore.py`) now writes
three coaching-engagement columns into the `study` block of every study
session, keyed by `session_id` like the rest of the record. They implement the
"delivered" and "engaged with" links of the fidelity chain registered in
pre-analysis plan Section 4.1.1 and listed in Appendix D:

- `coach_insights_n`: the number of coach messages delivered on the main
  thread (role `coach`, message type `main` or missing). This is "delivered".
- `coach_aside_n`: the number of messages the participant wrote to the coach
  (role `user`, message type `aside`). This is "engaged with".
- `coach_aside`: 1 if `coach_aside_n` is at least 1, otherwise 0.

The columns are computed from the session's messages at export time, not read
from a stored session field, so they sit outside the `STUDY_FIELDS` mapping and
the export schema guard in `packages/api` is unaffected. Non-study sessions
keep `study: null` as before. The arm is not special-cased: a control session
has no coach messages, so it reads 0, 0 and 0 by construction, and a nonzero
control value would itself flag a delivery fault. `--stats` gains a matching
line per condition giving how many study sessions have `coach_aside` = 1 and
the mean `coach_insights_n`.

`turns` is unchanged. It already carried every message, asides and coach
messages included, each tagged with its role and type, and the DQI loader
drops them before scoring, so asides remain outside the scored transcript. The
counting rule lives in one pure function, `coaching_engagement()`, covered by
three pytest cases in `scripts/tests/test_export_engagement.py`.

Nothing a participant sees or does is affected. The exporter is a read-only
analysis script that runs on a researcher's machine, so no deploy and no
`seed:reference` run is needed.

---

## 2026-09-23 — pilot stays desktop-only: mobile controls hidden in study sessions, viewport gate on entry (code only, not yet live)

Pre-analysis plan Section 3.1 registers the pilot as a laptop or desktop study:
the coach sits in a rail beside the conversation, which the layout only does at
Tailwind's `lg` breakpoint and above, 1024 pixels. Nothing enforced that until
now. PR #114 (22 Sep) added phone support to the app: header buttons that open
the coach and the LAPP radar in bottom sheets on narrow screens, hidden again
at `lg` and `xl` where the rails reappear. That work is for the regular app and
stays there. Left ungated it would quietly have given study participants a
treatment surface the plan never registered, a coach summoned into a sheet over
the conversation rather than one sitting beside it throughout. That is the
August B6 problem in reverse: the same mismatch between what the plan registers
and what participants actually see.

Two changes, both code only, neither live yet.

First, the mobile coach and metrics controls are rendered only when the session
is not a study session. Both header buttons and both bottom sheets in
`Conversation.tsx` are now gated on the same `isStudySession` flag the page
already uses for the study header and the finish button. Regular app behaviour
is unchanged at every width.

Second, entry to the pilot is gated on width. On `/pilot` and `/study`, if the
browser window is narrower than 1024 pixels the page does not create a session.
It shows a full page notice headed "Please use a laptop or desktop computer",
telling the participant to open the link on a laptop or desktop computer or to
widen the window. The check runs before `study.enter` fires, so a participant
who arrives on a phone leaves behind no session row, no assigned condition and
no stub transcript, and can reopen the same link on a laptop later as if for
the first time. The notice re-checks on window resize, debounced at 200
milliseconds, and clears itself once the window is wide enough: `/study` then
runs its enter flow, and `/pilot` returns to the normal landing page with the
Start conversation button. The threshold lives in one constant,
`STUDY_MIN_VIEWPORT_WIDTH` in `packages/app/src/lib/studyViewport.ts`, tied
there to PAP 3.1 and to the Tailwind `lg` breakpoint.

The gate is width only. It does not look at user agent or touch capability, so
a touchscreen laptop passes and a desktop browser window dragged narrow does
not, which is the property the plan actually cares about: whether the
registered layout is available, not what kind of device is in the
participant's hands. Regular app routes are untouched; nothing outside `/pilot`
and `/study` is gated on width.

Blocks are observable. The first block of a page visit calls a new
`study.deviceBlocked` mutation, which writes nothing to the database and logs
one line at info with `event: 'study_device_blocked'`, the participant id, the
Qualtrics response id, the viewport width, the viewport height and which of the
two routes was blocked, so the rate is queryable in Cloud Run logs during
fielding. It reports once per visit rather than once per resize, and the call
is fire and forget, so a participant who is already being turned away never
also sees an error from the logging. Nothing is written to the database because
no session exists yet and the participant may widen the window a moment later
and take part normally, so a row would record an attempt rather than an
outcome. As with `study_reentry_blocked`, the log line is what actually records
this: `track()` is a no-op in this deployment.

The Prolific device screen remains the first layer. Participants are screened
to desktop there before they ever reach a ConvoLab link, and this gate is the
backstop for anyone who opens the link on a phone anyway, from a saved link or
an email. It tells them what to do instead of letting them start a session the
plan cannot use.

---

## 2026-09-23 — partner-opens variant behind a per-session flag (code only, not yet live)

Today the participant always writes first: they meet a scene-setting card, an
empty conversation, and the question "How do you begin?". This adds the other
variant, where the partner speaks first, and puts it behind a per-session
boolean so the two can be split-tested with user testers before one is locked
in for the pilot.

The flag is `studyPartnerOpens` on the session. It is set from the URL
parameter `partnerOpens` (also `PartnerOpens` or `partneropens`;
`1`/`0`/`true`/`false` all work) on both `/study` and `/pilot`, and a link that
says nothing falls back
to `STUDY_PARTNER_OPENS_DEFAULT` in `packages/api/src/trpc/routers/study.ts`,
which is currently **false**: participant-first, exactly as today. The default
lives in two places and they have to flip together: that constant, which is the
one that decides anything, and `PARTNER_OPENS_DEFAULT` in `PilotLanding.tsx`,
which only decides which sentence the landing page shows when the link is
silent. A link that carries an unrecognised value (anything other than `1`,
`0`, `true` or `false`) is refused with "Invalid partnerOpens value." rather
than quietly running the default, because a session that ran the wrong variant
cannot be repaired afterwards. Because the flag is stamped on the session at
creation, a conversation keeps whatever variant it started with.

The opener is fixed text, not generated. There is one written opener per topic
crossed with partner ideology (seven topics, two ideologies) plus one generic
opener for a participant who picked their own topic, in
`packages/api/src/lib/partnerOpeners.ts`. Every participant on a given topic
and partner ideology reads the identical first message, so the stimulus is the
same for all of them and the first participant turn is a response to a known
prompt rather than to whatever the model produced that day. The openers are
identical in the coaching and control arms; nothing about them varies by
condition. `study.enter` writes the opener straight to the transcript as the
first partner message before the participant's socket opens, so it arrives in
the normal history replay and survives a refresh. That write happens after the
session row exists, so the WebSocket layer seeds the opener on connect if it
finds a partner-opens session with an empty transcript, logging
`partner_opener_seeded_on_connect`; if the session has no usable partner
ideology it logs `partner_opener_seed_skipped` and runs without an opener
rather than guessing which side the partner is on. The seed is guarded on an
empty transcript, so it cannot fire twice or reach a conversation already
under way.

The partner's system prompt is branched to match: in this variant it is told it
has already opened, must not restate the opening, and must keep its first reply
short. That block replaces the whole participant-first instruction, so the
sentence "Say one thing you believe and stop; you have the rest of the
conversation to make the case." is dropped along with it; the opener already
did that job. Everything else in the prompt is identical between the two
variants.

This also corrects a pre-existing inconsistency, which affected only the
coaching arm. Turn numbering counted asides, so a participant who asked the
coach a question before writing anything to the partner had their real first
turn numbered 2: the coach and the scorer treated it as a mid-conversation
turn, and the stored LAPP `turnNumber` stopped lining up with the client's walk
over main messages. Turn numbering now counts main-thread participant messages
only, which is the rule the rest of the app already used.

Coach and live-scorer timing follows the same flag, with no second flag to
keep in sync. Unprompted coaching and live LAPP scoring are still withheld
from an exchange where the participant opened cold, but when the partner
opens, the participant's first turn is already a response, so both run from
turn 1. The rule is one function, `shouldRunPostExchangeJobs` in
`packages/api/src/lib/postExchangeGate.ts`, with unit tests for all four
cases. On that turn the coach and the scorer are also handed the opener as
context, labelled as the partner's opening statement, because neither of them
is given conversation history: without it they would be judging a reply to
something they cannot read. Nothing else in either prompt changes, and on
every later turn the prompts are byte-identical to today's.

The scene-setting card changes one sentence: "How do you begin?" becomes "How
do you respond?" when the partner has opened. Everything else in the card is
unchanged. The card now stays on screen until the participant's own first
message rather than until the first message of any kind, so in this variant
the reader sees the partner's bubble with the card beneath it, above the
input. The side rails and the LAPP panel also wait for the participant's first
message, so a lone opener does not make the page look like a conversation
already under way. On the pilot landing page the treatment-arm support box
says "From your first message onward" instead of "From your second message
onward" when the link turns the variant on.

Exports carry the flag as the column `partner_opens` in the study block of
`scripts/export_transcripts_firestore.py`, so a transcript can always be
assigned to the variant it ran under, including the mixed set of user-testing
sessions this will produce. It is exported as a plain true/false: sessions
created before today have no such field and all ran participant-first, so they
are coerced to false rather than exported as null, which would have made the
column three-valued for no reason.

Standing consequence for the pre-analysis plan, to act on when the variant is
chosen: if partner-first is the version that ships, Appendix B's rule
excluding the participant's opening turn from Listen and Acknowledge has to be
dropped, and the scoring prompt updated to match. That rule exists only
because a participant who opens cold has nothing to listen to or acknowledge.
When the partner opens, the first turn is a response like any other, and
excluding it would discard the turn that the manipulation is most likely to
affect. Note that the frozen LAPP scoring prompt (`lapp_prompt_v4.txt` in the
dqi-scoring pipeline) still carries that exclusion, so any partner-opens
user-testing transcript scored before that prompt is revised is scored under
the participant-first rule and its first-turn Listen and Acknowledge values
should not be read as measurements.

---

## 2026-09-21 — one conversation per participant, enforced (code only, not yet live)

A participant who finished their conversation and then reopened the study link
used to get a brand-new session. `study.enter` resumed a prior session only
while it was still ACTIVE with no `endedAt`, and otherwise fell through to
creating one. Two such pairs are in the August test data: one participant
exited and reopened the link 15 seconds later, producing a second transcript
with the same condition, topic and partner.

It now starts nothing. A returning participant whose conversation has ended
sees "You have already had this conversation" and a button to the final
survey, on both `/study` (the route the pre-survey redirects to) and `/pilot`.
An in-progress conversation still resumes on refresh, unchanged.

The finished session is deliberately NOT reopened: nothing in the WebSocket
layer refuses messages on a COMPLETED session, so reopening it would let a
participant extend a transcript that is already an outcome measure.

Re-entry attempts are logged by the API at info level with
`event: 'study_reentry_blocked'`, so the rate is queryable in Cloud Run logs
during fielding. They also emit the matching telemetry event, but note that
`track()` is a no-op in this deployment (`lib/telemetry.ts`), so the log line
is what actually records it.

The decision rule lives in `packages/api/src/lib/studySessionDecision.ts` with
11 unit tests, including one that reproduces the August pair. Pre-analysis plan
5.1 gains a matching "One conversation per participant" paragraph: if a
participant somehow holds two sessions, the earliest by entry timestamp is the
one analysed, a rule that refers only to entry order and never to transcript
content.

---

## 2026-09-21 — pilot landing page: corrected when the coach starts suggesting (code only, not yet live)

The treatment-arm support box said "Once you send your first message, a coach
appears beside the conversation with suggestions...". The coach panel does open
that early, and a participant can ask it a question from the start, but its
unprompted suggestions are deliberately withheld until the first exchange is
complete (`conversation.ts`: "Skip coach on the first exchange — let the user
form their own response first"). Every coaching transcript to date confirms it:
the first coach message lands after the participant's second message, unless
the participant wrote to the coach first.

Now reads: "A coach appears beside the conversation as soon as you start. From
your second message onward it will offer feedback and suggestions. You can also
ask it questions directly at any point." (Wording set by Hanna, 21 Sep. An
earlier revision on the same day named the four LAPP steps here; they were
dropped as redundant, since the Conversation framework box immediately below
already sets out Listen, Acknowledge, Pivot and Perspective.)

Treatment arm only, since the box is shown only when condition = 1. No
behaviour change; the copy now matches what the platform does. The wording
deliberately does not explain why the first turn is left alone, to avoid
drawing attention to a turn that is itself scored post-hoc.

---

## 2026-09-16 — scene-setting intro replaces the empty-conversation copy (code only, not yet live)

Before the participant's first message the conversation page used to read
"<Name> is ready when you are. Open with a question. Listen before you push."
It now reads, for a study session:

> **Meet Megan.** She is a conservative who sees immigration differently from
> you. You have just sat down together and the topic has come up. Imagine this
> is a real conversation. How do you begin?

Name, pronoun, ideology label (liberal / conservative) and topic come from the
session's partner assignment. For "Pick your own topic" the sentence says
"sees politics differently from you" and "the topic you chose has come up",
since free text cannot be slotted into the sentence safely. Identical in both
arms; the old copy was also shown to both arms. Wording agreed by the team,
15 Sep 2026.

Public-app sessions with a partisan persona get the same intro with "sees things
differently from you" and no topic clause; the angry uncle, coworker and custom scenarios keep the old copy.
Participant turns are still the participant's own: the intro is text on the
page, not a message, and is not part of the transcript.

---

## 2026-09-16 — NOT A STUDY CHANGE: public-app personas get their own names (code only, not yet live)

The four study personas now exist twice in the seed. The pilot records
(`progressive-left-*`, `populist-right-*`) are unchanged: Mark Johnson and
Megan Johnson, matched across ideology, tagged `audience: 'pilot'` and hidden
from the public scenario picker. Four public-app copies (`general-*`) are
generated from the same prompt text by name substitution: Joshua Moore and
Emily Davis (progressive), Ryan Taylor and Ashley Brown (right-populist). The
public names were chosen to sit with each persona's politics in FEC-donor and
voter-file name data while staying racially unmarked; the pilot keeps matched
names so the ideology contrast is not confounded with the name.

Study sessions are unaffected: `study.ts` resolves the pilot slugs directly.
Takes effect only after merge, deploy AND a reference-data re-seed.

---

## 2026-09-15 19:57 UTC — revision `convolab-api-00067-qt8` — pilot landing page names

The `/pilot` landing page introduced the partner with the pre-2026-09-05 first
names (Marcus or Maya on the left, Max or Megan on the right) while the
conversation itself has used Mark Johnson and Megan Johnson since the 5 Sep
re-seed. Three of the four cells therefore showed one first name on the landing
page and another in the chat. The preview now says Mark or Megan, matching the
stored personas. Code only; no re-seed.

Sessions entered between 2026-09-05 14:11 UTC and 2026-09-15 19:57 UTC saw the
mismatch. Commit `280e489`.

---

## 2026-09-05 — partner names matched across ideology (code only, not yet live)

All four personas are now **Mark Johnson** (male) and **Megan Johnson**
(female), replacing Marcus/Maya Johnson on the left and Max/Megan Briggs on the
right. The name now carries only the gender manipulation, which participants
need to perceive, and none of the ideology manipulation.

Name pair chosen on prototypicality grounds: Johnson is among the most common US
surnames and is common across racial groups, so it is less diagnostic than
Briggs. This matters because none of the personas state race, so the name was
doing that signalling implicitly.

✅ **LIVE from 2026-09-05 14:11 UTC** (revision `convolab-api-00066-6vv` plus a
re-seed). Sessions entered before that time keep the asymmetric naming described
in the 2026-09-03 entry; sessions after it have matched names.

The same deploy moved the reply-length rule out of the persona text and into the
runtime (`PARTNER_RESPONSE_POLICY`), so it now applies to all four personas
identically and by construction. No change to what the rule says.

Commits `4d6f10e` and `4c35a60`.

---

## 2026-09-03 — KNOWN CONDITION, not a change: partner name is confounded with ideology

Identified, not introduced, on this date. It has applied to every study session
so far and is **still live**.

The master persona document deliberately holds the partner's name constant
across the ideology manipulation — Max Briggs is both the right-leaning populist
and the left-wing progressive, Megan Briggs likewise — so that only the politics
differ. The code does not implement this. Production has one set of persona
records, shared by the general app and the pilot, and their names are:

| Slug | partnerPersona |
|---|---|
| `progressive-left-male` | Marcus Johnson |
| `progressive-left-female` | Maya Johnson |
| `populist-right-male` | Max Briggs |
| `populist-right-female` | Megan Briggs |

Partner ideology is randomised, so partner **name is perfectly correlated with
the ideology condition**: left arm gets Johnson, right arm gets Briggs. The name
appears in the conversation header and above every partner message, making it one
of the most salient cues in the interface. Any difference measured between
ideology conditions therefore includes whatever the name difference contributes,
and the two cannot be separated after the fact because they never varied
independently.

**Sessions affected: all 16 to date** (14 Aug – 31 Aug), 12 with a right-leaning
partner and 4 with a left-leaning one.

Two related conditions apply to the same sessions:
- The left personas are **not** the master document's Progressive Left. They are
  a different, older persona (age 28, "a mid-sized U.S. city") rather than the
  document's age-31 Youngstown one.
- The left personas are roughly **half the length** of the right ones (~1,100
  words vs ~2,400–2,600), so persona richness also varies with ideology.

No fix applied yet — pending a decision on which persona generation is canonical.
Logged as B21 and B22 in `docs/bugs.md`.

---

## 2026-08-26 23:24 UTC — revision `convolab-api-00065-bhr` — SURVEY PLATFORM MOVED

Hanna's Purdue postdoc ended and her Qualtrics account was closed. Both surveys
were re-uploaded to **Harvard Qualtrics** and have new ids.

| | Old (Purdue) | New (Harvard) |
|---|---|---|
| Pre-survey | `SV_cTT6h3GdIPz4LUG` | `SV_9TQmgGn73T5VRoq` |
| Post-survey | `SV_6RqHAgXaoysp5Ay` | `SV_0J6ib9FF8hWhqEm` |

`POST_SURVEY_URL` is now Secret Manager version 2. The app never references the
pre-survey — that link points *into* the app, so it changes on the Prolific side.

**Responses collected before this point live in the Purdue account**, which
Hanna can no longer access. The 24 Aug CSV export is a partial backup (114 rows,
4 genuine). Anything after that date, including Daniel's 26 Aug session, needs
retrieving by someone who still has Purdue access.

**Treat Harvard responses as a separate collection wave.** They are in a
different Qualtrics instance under different survey ids, and whether the
question-level fixes made before 26 Aug survived the export/re-upload has to be
re-verified rather than assumed.

Commit `eb13472`.

---

## 2026-08-26 19:03 UTC — revision `convolab-api-00063-m5b`

**Participant-visible, treatment-affecting.** Automatic coach insights were
being hidden once a participant used the one-on-one Q&A. The coach still
generated them and they were persisted — the panel rendered all insights in a
block above all Q&A while auto-scrolling to the bottom, so later insights landed
off-screen. Treatment-arm participants who used the aside stopped seeing the
per-turn coaching that is the intervention.

Also corrected coach-insight tone tinting, which had been showing each insight
with the previous turn's tone.

Sessions before this time in which a treatment participant used the Q&A should
be treated as having received reduced coaching *visibility* from that point on,
even though the coaching was generated. Daniel's session
`D7WHf1iUsbconj3bVXxD` (26 Aug) is one such case.

Commit `bf868ea`.

---

## 2026-08-25 19:06 UTC — revision `convolab-api-00062-m9d`

**Participant-visible, cosmetic.** The conversation header and input placeholder
showed `"Marcus Johnson: Pick your own topic"` instead of the topic the
participant typed. Affects own-topic participants only. The partner already
knew the real topic, so conversation content is unaffected.

Commit `6276c0c`.

---

## 2026-08-25 02:47 UTC — revision `convolab-api-00061-nfd` + re-seed

**The main partner-behaviour cutover.** Sessions entered before this time are
not comparable to those after on partner voice, reply length, or conversation
length.

### Partner reply length and shape (prompt — required the re-seed)

Measured beforehand on 97 real pilot turns: median 53 words, half of all turns
inside a 40-66 word band, median 3 sentences.

- Removed `"A strong response should usually do four things"` (answer, reason,
  concrete example, pushback). Four mandated beats produced the same shape and
  length every turn. Now a pick-one-or-two menu.
- Removed `"usually 3-6 sentences, 6-8 when challenged"`, which appeared twice
  in each populist persona, and `"prioritize argument quality over strict
  brevity"`.
- Added one shared policy to all four study personas: most replies 1-3
  sentences, never past 4, with an explicit instruction to vary length.
- **Removed a left/right confound.** The progressive personas had been told 2-4
  sentences and the populist personas 3-6. Partner ideology is randomised, so
  the two ideology conditions previously differed systematically in verbosity.

Commit `09f0700`.

### Partner gender (prompt — required the re-seed)

The two populist personas described themselves only in the third person
("Megan believes... She..."), stating gender nowhere the model reads as
first-person fact, and produced `"Guys like me"` from a woman. All four personas
now carry an explicit second-person gender and pronoun block.

The masculine-idiom warning is applied **only to the woman personas**: "guys
like me" is ordinary speech for a man, and since partner gender is randomised
the conditions must differ in gender alone.

Commit `e79a8d2` (as `ca8aa07` before rebase).

### Coach pronouns (prompt — stamped per session at creation)

The shared coach prompt is written in generic "they/their" because one prompt
serves all four personas, so the coach referred to a visibly female partner as
"they". The partner's name and pronouns are now injected per session.

Commit `e79a8d2`.

### First partner reply shortened (code)

Added to `buildStudyPrompt`, which is appended last and is the position where
the existing "Begin with an opinionated opening statement" instruction fires.
Instructs the partner to open in one or two sentences so participants are not
met with a block of text.

Commit `09f0700`.

### Conversation window: 7/8 minutes → 8/12 (code)

The soft cap changed meaning. It was a countdown to the end; it is now the point
at which the participant may leave.

- Survey unlocks at **8 minutes** regardless of turn count, or at 6 participant
  turns, whichever comes first.
- Hard stop moved to **12 minutes** and is the only limit that ends a
  conversation.
- "Wrapping up soon" warning moved from 90s before the soft cap to 90s before
  the hard stop.
- A voluntary finish now always records `participant_finish`. It previously
  recorded `soft_cap` once past the cap, which conflated "chose to stop" with
  "was stopped" — and after this change the cap enforces nothing.

Commit `30356f2`.

### Session timer no longer restarts on refresh (code)

The clock counted from page load, so a refresh handed the participant a fresh
window and the hard stop was unenforceable. It is now anchored server-side to
first conversation connect and persisted.

Commit `22d227e`.

### Starter prompts removed from study sessions (code)

Three hardcoded chips ("What changed at the plant?", "Tell me about your
grandparents") appeared in every scenario including all five partisan study
scenarios. They were experimenter-supplied openers landing on a scored first
turn in both arms. Removed for study sessions; retained for the non-study
practice app with rewritten copy.

Commit `22d227e`.

### Duplicate participant messages fixed (code)

A participant's own message could render twice when a reconnect replayed history
before the LAPP score arrived. Visible transcript corruption, no effect on
stored data.

Commit `e79a8d2`.

---

## Session classification

At the 2026-08-25 02:47 UTC cutover:

| | Sessions |
|---|---|
| Before — old partner behaviour | 12 |
| After — new partner behaviour | 1 |

The 12 earlier sessions span 2026-08-14 to 2026-08-24 and include several with
0-1 participant turns (abandoned or internal tests). Classify by
`studyEnteredAt` in the transcript export, not by export order.

---

## Qualtrics-side changes

Recorded here because they change what participants see, but they are not in
git.

- **2026-08-24** — the open-ended `app_experience` question was displaying for
  one topic only, having been nested under a per-topic display logic. Fixed by
  Hanna. All 4 genuine post-survey responses before this date have it empty.
  Note a Qualtrics edit only reaches the live link once **published**; an
  un-published fix behaves exactly like an unfixed one.
- **Outstanding** — `Q55` pipes `${e://Field/Random ID}`, and no such embedded
  data field exists, so a participant who declines data use is shown a blank
  Random ID and has nothing to quote when requesting removal.
