# reCAPTCHA setup for the practice landing page

The public practice landing at `/` asks visitors to tick a reCAPTCHA checkbox
before `practice.start` creates a session. The key lives in Google Cloud's
reCAPTCHA console ("Fraud Defense") in project `convolab-490517`:

- Key id (= public site key): `6LcMwdstAAAAADFzrXQskk2v5dAMzQ52931gX6Tk`
- Type: Website, checkbox
- Domains: `www.convolab.us`, `convolab.us`, `localhost`

Keys created in the Cloud console have **no legacy secret key**, so the API
does not use the old `siteverify` endpoint. It verifies each token by creating
a **reCAPTCHA Enterprise assessment**
(`POST https://recaptchaenterprise.googleapis.com/v1/projects/convolab-490517/assessments`),
authenticated with Application Default Credentials, i.e. the Cloud Run runtime
service account. Code: `packages/api/src/lib/recaptcha.ts`.

| Value | Where it goes | Secret? |
| --- | --- | --- |
| Site key (client) | `VITE_RECAPTCHA_SITE_KEY`, inlined into the frontend bundle at image build time (Cloud Build substitution `_VITE_RECAPTCHA_SITE_KEY`) | No, it is public |
| Site key (server) | `RECAPTCHA_SITE_KEY` on the API. Optional in production: when unset, the API uses the key id above, built in as `DEFAULT_RECAPTCHA_SITE_KEY` | No |
| Project | `GOOGLE_CLOUD_PROJECT` (already set by `cloudbuild.yaml`), falling back to `FIRESTORE_PROJECT_ID` | No |

A token is accepted when the assessment says `tokenProperties.valid === true`
and either there is no `riskAnalysis.score` (normal for checkbox keys) or the
score is at least 0.5. Rejections are logged at warn level as
`recaptcha_rejected` with `reason` and `invalidReason` (never the token).

In production the check **fails closed**: missing credentials, a missing
project id, an HTTP error from the API (for example 403 because the API is not
enabled or the role is missing) or a network error all reject the request with
"Captcha verification failed". `/pilot` and `/study` do not use reCAPTCHA and
are unaffected.

## 1. Enable the API (one-time)

```bash
gcloud services enable recaptchaenterprise.googleapis.com --project=convolab-490517
```

## 2. Let the runtime service account create assessments (one-time)

The service runs as `633459139926-compute@developer.gserviceaccount.com`:

```bash
gcloud projects add-iam-policy-binding convolab-490517 \
  --member=serviceAccount:633459139926-compute@developer.gserviceaccount.com \
  --role=roles/recaptchaenterprise.agent
```

Check both:

```bash
gcloud services list --enabled --project=convolab-490517 --filter=recaptchaenterprise
gcloud projects get-iam-policy convolab-490517 \
  --flatten='bindings[].members' --filter="bindings.role=roles/recaptchaenterprise.agent"
```

No Secret Manager secret is needed. The empty `RECAPTCHA_SECRET_KEY` secret
created on 2 Oct 2026 for the earlier design is unused and can be deleted:

```bash
gcloud secrets delete RECAPTCHA_SECRET_KEY --project=convolab-490517
```

## 3. Deploy with the site key

From the repo root, on the commit you want to ship:

```bash
gcloud builds submit --project=convolab-490517 --config=cloudbuild.yaml \
  --substitutions=_TAG=$(git rev-parse HEAD),_VITE_RECAPTCHA_SITE_KEY=6LcMwdstAAAAADFzrXQskk2v5dAMzQ52931gX6Tk
```

Pass `_VITE_RECAPTCHA_SITE_KEY` on **every** deploy (or set it as a default on
the Cloud Build trigger, if one is used). Leaving it out builds a frontend with
no checkbox, and Start fails closed in production.

## 4. Verify

1. Open <https://convolab.us/> in a private window, pick a scenario, tick the
   checkbox, press Start; a practice conversation should open.
2. If Start fails, look for the reason in Cloud Run logs:
   ```bash
   gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.event="recaptcha_rejected"' \
     --project=convolab-490517 --limit=10 --freshness=1h
   ```
   `reason: "error"` with `HTTP 403` means step 1 or 2 is missing;
   `reason: "invalid-token"` shows Google's `invalidReason` (for example
   `BROWSER_ERROR`, `EXPIRED`, `SITE_MISMATCH`).

## Local development

With neither `VITE_RECAPTCHA_SITE_KEY` nor `RECAPTCHA_SITE_KEY` set, the
frontend skips the widget and sends a placeholder token, and the API skips
verification (outside `NODE_ENV=production`, an unset `RECAPTCHA_SITE_KEY`
means "not configured", as an unset secret did before). It also allows the
request in dev when no Application Default Credentials are available.

To test the real flow locally, set both `VITE_RECAPTCHA_SITE_KEY` and
`RECAPTCHA_SITE_KEY` to the key id in `.env`, and have ADC
(`gcloud auth application-default login`; Docker Compose mounts
`~/.config/gcloud` into the API container). Your own account then needs
permission to create assessments in `convolab-490517`. `localhost` is on the
key's domain list.
