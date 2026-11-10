# Instructions for AI Coding Assistants

This file is for Codex, Cursor, GitHub Copilot, Gemini and any other AI
assistant working in this repo. (Claude Code reads `CLAUDE.md` directly.)

**Before anything else, read `CLAUDE.md` in full.** It is the project context
for every assistant: what the app is, the Firestore data layer, auth, how to
run and test it, and the rules that keep the live pilot study safe. Where it
says "Claude", read "you".

The team coordination steps below are copied from `CLAUDE.md` so that no
assistant can miss them. If you change one copy, change both.

## Team Coordination (do this before writing code)

Several people work on this repo at once, most of them with an AI assistant.
The project board is the one place that says who is doing what:
https://github.com/orgs/GRAIL-center/projects/1. Work that is not on the board
and has no pushed branch is invisible to everyone else, and gets duplicated.

1. **Find the issue.** `gh issue view <n>`. No issue yet? Create one first
   (Why / How / Done when, like the existing ones) and add it to the board.
2. **Check nobody else has it.** If the issue has another assignee, or
   `gh pr list --state open --search "<n>"` shows an open PR, stop and tell the
   user. Do not start a parallel version unless they say so.
3. **Check for overlapping files.** `gh pr list --state open --json number,title,author,files`.
   If an open PR touches files you are about to change, tell the user first.
4. **Claim it.** `gh issue edit <n> --add-assignee @me`, and move the card to
   **In progress** on the board.
5. **Open a draft PR on the first push**, not at the end:
   `gh pr create --draft`, with the body starting `Part of #<n>` (or
   `Closes #<n>`). Push at the end of every working session, even unfinished
   work; the draft PR is how the team sees progress.
6. **Leave a status line when you stop.** One line on the PR or issue: where it
   stands and what is next. Dropping it? Unassign yourself and move the card
   back to Ready for dev.
7. **Server code runs the live pilot.** Changes under `packages/api` say so in
   the PR. Never deploy; deploys are coordinated by Hanna.

Board columns: **Backlog** (not yet specified), **Ready for dev** (specified,
nobody on it), **In progress** (assigned, with a draft PR), **Done** (merged).
