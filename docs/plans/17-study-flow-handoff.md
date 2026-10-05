# Plan 17: Study Flow Handoff (Qualtrics → App → Qualtrics)

**For:** Sarrah
**Context:** Phase 1 pilot RCT, ~375 Prolific participants, target launch ~15 Aug.
This is the missing middle of the study pipeline. The two Qualtrics ends are
already fixed (see "Already done" below); the app work is this plan.
**Written:** 7 Aug 2026, by Claude with Hanna. Questions to Hanna.

## The problem

The study flow is: Prolific → Qualtrics pre-survey → convolab.us conversation →
Qualtrics post-survey → back to Prolific for payment. Today the app has no code
for either handoff: the pre-survey redirects to
`https://convolab.us/?topic=...&condition=...&partner=...` and the app ignores
those params (entry is invite-token based only), and nothing at conversation end
sends the participant to the post-survey. Both must exist before fielding.

## Identity: how we know who's who (no manual steps for participants)

Do NOT use IP addresses (unreliable behind NAT/mobile/VPN, and an IRB
data-minimization problem). Use the ID Prolific already provides:

- Prolific appends `PROLIFIC_PID` (and `STUDY_ID`, `SESSION_ID`) to the study
  URL it opens for each participant.
- The pre-survey captures `PROLIFIC_PID` as embedded data (add the field in the
  Qualtrics survey flow if not present; Qualtrics auto-fills it from the URL).
- The pre-survey redirect passes it to the app; the app stores it on the
  session; the app passes it into the post-survey; the post-survey records it.
- Linking key across all three datasets = `PROLIFIC_PID`. Secondary keys:
  the app's own `sessionId` (passed into the post-survey) and Qualtrics
  ResponseIDs. Nothing is asked of the participant at any point.

Participant experience: they click from the pre-survey, land on a minimal study
page, the app silently creates an anonymous GUEST session (same machinery as
invitation claims), and the conversation starts. At the end, one button (or an
auto-redirect) takes them to the post-survey.

## URL contracts

1. **Prolific → pre-survey** (Hanna sets in Prolific):
   `<pre-survey link>?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`

2. **Pre-survey → app** (update the survey's end-of-survey redirect; current
   one lacks pid):
   `https://convolab.us/study?pid=${e://Field/PROLIFIC_PID}&topic=${e://Field/Topic}&condition=${e://Field/Condition}&partner=${e://Field/PartnerGender}&rid=${e://Field/ResponseID}`
   Topic values (exact strings, set by the fixed pre-survey
   `ConvoLab_presurvey_topicED_fixed.qsf`): `Environment`, `Freedom of speech`,
   `Guns`, `Healthcare`, `Housing`, `Immigration`, `Taxes`, or
   `Pick your own topic` (with the free text in a separate `TopicOwn` field;
   pass it too if easy: `&owntopic=${e://Field/TopicOwn}`).
   `condition` and `partner` are `0` or `1` (random draws made in Qualtrics;
   the randomization moment is pre-registered as happening in the pre-survey,
   so the app must NOT re-randomize).

3. **App → post-survey** (at conversation end):
   `<post-survey link>?PROLIFIC_PID=<pid>&Topic=<topic>&Condition=<condition>&PartnerGender=<partner>&AppSessionID=<sessionId>`
   Param names are case-sensitive on the Qualtrics side; `Topic`, `Condition`,
   `PartnerGender` must match the embedded-data fields the post-survey flow
   declares (they exist already). `Topic` must carry the same exact string
   received in step 2; the post-survey's topic branches match on it
   (fixed copy: `Post-survey_ConvoLab_topicED_fixed.qsf`). Add `PROLIFIC_PID`
   and `AppSessionID` as embedded-data fields in the post-survey flow.

4. **Post-survey → Prolific completion** (Hanna sets in Qualtrics end-of-survey
   redirect): `https://app.prolific.com/submissions/complete?cc=<completion code>`
   Without this, participants cannot get paid; do not skip it.

## App work

### A. Study landing route

- New route, suggested `/study` (a bare `/` query-param handler also works, but
  a dedicated route keeps the public landing page separate; see below).
- Reads `pid`, `topic`, `condition`, `partner`, `rid`, optional `owntopic`.
- Silently creates (or resumes, see edge cases) an anonymous GUEST user and a
  conversation session, reusing the invitation-claim machinery
  (`Invite.tsx` → `trpc.invitation.claim` → `/conversation/:sessionId` is the
  pattern; a new tRPC procedure like `study.enter` is cleaner than overloading
  invitations).
- Session config from params:
  - `topic` → selects the out-partisan scenario for that topic. Own topic
    ("Pick your own topic") → use `owntopic` text with the existing custom
    scenario elaboration flow, or a generic out-partisan partner if that is
    too slow for the study; Hanna decides.
  - `condition` → coach on/off. **Fix and record the mapping: `1` = coaching
    (treatment), `0` = control.** This mapping must be written down and never
    changed mid-study (it is effectively part of the randomization).
    **Enforce server-side, not just in the UI:** for control sessions the
    coach agent must never be invoked at all (no coach calls, no coach
    messages in the transcript), and the coach panel/UI is absent. Both arms
    are otherwise identical: same partner behavior, same LAPP orientation,
    same timers. Same single app, per-session flag; no separate deployment.
    Store the resolved condition on the session record and include it in the
    transcript export, since scoring and analysis group by it.
    **Model pinning (PAP v7.8 commitment, updated 9 Aug):** each agent runs
    on a fixed provider and model version, pinned in config for the entire
    fielding period. The two agents need NOT share a model; Hanna's working
    choice (9 Aug, to be finalized before launch): partner = Claude Sonnet,
    coach = Gemini. The partner model must be identical across arms. The
    model registry stays multi-provider, but study sessions must not follow
    provider updates or registry defaults. Record the pinned provider:model
    strings (one per agent) on the session record and in the transcript
    export; the same strings get archived on OSF with the scoring pipeline.
    **Control layout (decided with Hanna 7 Aug):** control gets its own
    deliberate layout, a full-width plain chat: no coach panel, no left-hand
    insight bar, no "Ask the Coach" input-mode toggle, no empty rails where
    treatment components would sit. It must read as a complete, polished chat
    app in its own right, not a stripped version; a control arm that looks
    broken or impoverished creates demand effects of its own. Treatment keeps
    the existing chat + coach panel layout.
  - `partner` → partner gender (`1` = female, `0` = male; same rule: fix it,
    record it).
  - Partner ideology: set opposite to participant party. Party ID is collected
    in the pre-survey but NOT passed in the current redirect. Two options:
    (a) add `&party=${e://Field/...}` to the redirect (needs a new embedded
    data field in the pre-survey set from the party items), or (b) ask in-app.
    (a) is better; coordinate with Hanna, and note the open PAP question about
    how Independents/Something-else map to partner ideology (randomized).
- Store on the session record: `prolificPid`, `qualtricsResponseId`, `topic`,
  `ownTopic`, `condition`, `partnerGender`, `enteredAt`. These are the linking
  and analysis fields; they must survive to export.
- Token quota: study sessions need a quota like invitation sessions
  (~15-minute conversation); reuse the invitation quota presets.

### B. Conversation end: mechanism and redirect

Decided with Hanna 7 Aug (pilot values, tune by feel in testing):

- **Turn floor: 6 participant turns.** The Finish option is disabled until the
  participant has sent at least 6 messages.
- **Soft cap: 7 minutes,** checked at message boundaries only, never
  mid-composition. When it expires: if the participant is typing, let them
  finish and send; that message is flagged as the final exchange. The partner
  then gives a natural closing turn (prompted to wind down, no new arguments),
  the coach adds one closing observation (treatment arm only), and the
  conversation ends at a clean boundary.
- **Hard stop: 8 minutes,** a safety net only. It blocks STARTING any new
  message; an in-flight send plus the closing exchange is always allowed to
  complete, so nobody is ever cut off mid-sentence. (Note: 7-to-8 is a tight
  window for the wrap-up choreography with slow typists; if testing shows
  truncated closings, widen the hard stop rather than the soft cap.)
- **No visible countdown** (clock pressure degrades writing quality and adds
  demand effects). Show a quiet "wrapping up soon" banner when ~90 seconds
  remain before the soft cap. Use the partner's typing-indicator delay to pace
  fast typers.
- Identical parameters in both arms. Because coach interventions consume time
  in the treatment arm, treatment participants will mechanically average fewer
  turns in the same budget; this is accepted and noted in the PAP limitations,
  not engineered around.
- Log per session: participant turn count, wall-clock duration, end type
  (soft-cap wrap-up / participant-initiated finish / hard stop / abandoned).

On finish: show a one-line transition ("Taking you to the final survey...")
and redirect to the post-survey URL (contract 3).
- Also surface a fallback link ("Click here if you are not redirected").
- The redirect must fire for BOTH arms identically.
- An always-available exit ("End conversation early") should ALSO route to the
  post-survey, not to a dead end; early exits are attrition data, and the PAP
  promises an exit that still reaches the debrief. Log the exit type.

### C. Public landing page (Sarrah's parallel task)

- Keep `/` as the public marketing/landing page; the study route stays separate
  and minimal (no marketing copy, nothing that could prime participants:
  no testimonials, no "improve your dialogue skills" claims beyond what the
  consent text says). Plain: study name, a sentence that the conversation is
  with AI agents, a Start state.
- If a participant hits `/study` with missing/invalid params, show a neutral
  error with instructions to return to the survey tab, and log it.

## Edge cases

- Refresh / re-entry with the same `pid`: resume the existing session, do not
  create a second one (one pid = one session; enforce on the server).
- Duplicate post-survey entry: Qualtrics side, "prevent multiple submissions"
  option; app side, keep the redirect idempotent.
- Missing `pid` (someone hits the URL directly): create nothing; show the
  neutral error page.
- Missing or invalid `condition` (absent, or not exactly 0/1 after parsing):
  FAIL CLOSED. Do not create a study session, never default or re-randomize
  (assignment happens only in Qualtrics; a default-to-control fallback would
  silently break the randomization). Neutral error page + alert-level log of
  the full query string. Same if a study session reaches conversation start
  with no stored condition. Invite links (/invite/:token) are a separate
  non-study flow and never create study-flagged sessions. Test the error
  path deliberately (missing, condition=2, condition=abc) during end-to-end
  testing.
- `topic` string mismatch: log it loudly in the app; a silent fallback would
  break the post-survey branching invisibly.
- Participant closes the tab mid-conversation: their partial transcript stays
  linked via pid; no recovery flow needed for the pilot.

## Testing checklist (before launch, all seven topics + own topic)

1. Prolific preview link → pre-survey: pid captured.
2. Pre-survey each topic → app: correct scenario, correct coach on/off per
   `condition`, partner gender per `partner`.
3. Conversation end (normal + early exit) → post-survey: correct topic block
   displays, pid/AppSessionID recorded.
4. Post-survey → Prolific completion code.
5. Merge test: one row per participant joining pre CSV, app export, post CSV
   on `PROLIFIC_PID`; confirm no collisions and the orphaned QID144 column is
   dropped.
6. Load: the study needs ~375 users over days with concurrency spikes; the
   Firestore migration merged 4 Aug has never carried that (see repo CLAUDE.md);
   run the planned load test on this flow specifically.

## Already done (Qualtrics side)

Note, 7 Aug: importing edited .qsf files produced surveys that error at
preview, so the fixes were applied directly in the LIVE original surveys
instead (via the Claude browser extension, guide in the Preanalysis plan
folder: `Qualtrics_live_edit_guide.md`). The .qsf files in that folder
(`ConvoLab_presurvey_fixed_v2.qsf`, `Post-survey_ConvoLab_topicED_fixed.qsf`)
are reference specs of the changes, NOT files to import. Because the live
surveys were edited in place, their survey IDs and links are unchanged:
target the existing surveys, nothing needs re-pointing.

Changes applied to the live surveys:

- Pre-survey: `Topic` + `TopicOwn` embedded data set after the topic question
  (previously the redirect sent `topic=` empty). NOT yet done: the `pol_int`
  WCAG fix (matrix to three single-answer MC questions) was deferred by Hanna
  on 7 Aug; the matrix and its accessibility warning remain. If it is done
  later, keep export tags `pol_int_1/2/3` and 1-4 coding so the data schema
  is unchanged (spec in the reference .qsf).
- Post-survey: the seven topic branches now fire on the `Topic` embedded-data
  field (exact labels listed in the URL contracts above) instead of the
  unanswerable pre-survey question.
- Hanna still needs to: add `PROLIFIC_PID` capture to the pre-survey flow,
  add `PROLIFIC_PID`/`AppSessionID` fields to the post-survey flow, set the
  Prolific completion redirect, and re-publish after each change.

## Open items needing Hanna

1. Post-survey URL + Prolific completion code (for contracts 3 and 4).
2. Own-topic handling in the app (elaboration flow vs generic partner).
3. Whether to pass party ID through the redirect (recommended; still open).
   The partner rule itself is now DECIDED in the PAP (v7.4+): Democrats
   including leaners get a conservative-leaning partner, Republicans
   including leaners a liberal-leaning partner, pure Independents ("Neither")
   and "Something else" respondents get randomly assigned partner ideology.
   Build to that rule.
4. ~~Session time/turn limit and what triggers "end of conversation."~~
   Resolved 7 Aug: see section B (6-turn floor, 7-min soft cap, 8-min hard
   stop, no visible countdown).

## Notes for the pre-analysis plan (fyi, do not change app behavior casually)

The registration-candidate PAP (v7.8, 9 Aug) states: randomization happens
via the Qualtrics embedded-data draw in the pre-survey; the app delivers,
never re-randomizes; the conversation pacing in section B (6-turn floor,
7-min soft cap, 8-min hard stop) is registered text, so changing those
values after registration is a documented deviation; each agent's model is
pinned per the model-pinning block above; analyses need attrition stages
(entered app, ≥3 participant turns, reached post-survey, data-use consent),
so log enough to reconstruct that funnel; and transcripts must be exportable
with condition, topic, pid, AND the pinned model strings attached.
