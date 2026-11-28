# Spending alerts and limits

Issue #283. This page records the spending alerts and limits set up in the provider consoles. None of this is in code. Change it in the consoles, then update this page.

Alerts go to **Hanna only**. The issue asked for at least two people, but Hanna chose to be the only recipient because she is the only billing admin.

## Google Cloud (Gemini via Vertex AI, Cloud Run, Firestore, etc.)

Billing account `019174-67F03A-7B6DBB` ("My Billing Account") pays for three projects: `convolab-490517` (ConvoLab) and two non-ConvoLab projects. Gemini runs through Vertex AI, so its cost shows up here.

| Budget | Covers | Amount | Emails at | Who gets them |
|---|---|---|---|---|
| ConvoLab monthly budget ($50) | `convolab-490517` only | $50 / month | 50%, 90%, 100% of actual spend, plus a warning when the month is forecast to pass 100% | Billing admins (Hanna) |
| $30 Monthly Budget Alert | All three projects | $30 / month | 50%, 90%, 100%, 150% | Billing admins (Hanna) |

Both budgets count credits. For reference, ConvoLab cost about $15 in October 2026, before the pilot.

**Google budgets only send email. They never stop spending.** The only hard stop Google offers is turning off billing for the project, which takes the website and the pilot offline, so we don't use it. The real brake is the practice limits below.

To check or change: Google Cloud console → Billing → Budgets & alerts, or

```bash
gcloud billing budgets list --billing-account=019174-67F03A-7B6DBB
```

## Anthropic (Claude coach and other Claude calls)

Set in the Claude Console at platform.claude.com/settings/spend-limits (sidebar: Spending & usage → Spend limits).

- **Monthly spend limit:** _to be filled in once set_. This one is a real stop. When it is reached, Claude API requests fail (HTTP 400, "You have reached your specified API usage limits") until the next month or until someone raises the limit. The app will then fall back or show errors for anything that needs Claude.
- **Email notifications:** on, to Hanna.

## The real brake: practice limits (#138)

Per-account, per-guest, per-network and site-wide caps on new practice conversations are enforced on the server. They are described in `docs/plans/20-guest-cost-limits.md` (PR #277). The console alerts above tell us when something gets past those caps.
