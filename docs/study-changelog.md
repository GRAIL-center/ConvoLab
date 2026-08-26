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
