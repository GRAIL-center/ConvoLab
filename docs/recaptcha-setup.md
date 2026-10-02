# reCAPTCHA setup for the practice landing page

The public practice landing at `/` asks visitors to tick a reCAPTCHA checkbox
before `practice.start` creates a session. Two values are needed:

| Value | Where it goes | Secret? |
| --- | --- | --- |
| Site key | `VITE_RECAPTCHA_SITE_KEY`, inlined into the frontend bundle at image build time (Cloud Build substitution `_VITE_RECAPTCHA_SITE_KEY`) | No, it is public |
| Secret key | `RECAPTCHA_SECRET_KEY` on the Cloud Run service, read by the API to verify tokens (Secret Manager secret, wired via `_RECAPTCHA_SECRET_REF`) | Yes |

**Until this is done:** `/` shows the landing page, but Start fails closed in
production ("Captcha verification failed"), because the API refuses every
request when `RECAPTCHA_SECRET_KEY` is unset and `NODE_ENV=production`.
`/pilot` and `/study` do not use reCAPTCHA and are unaffected.

## 1. Create the reCAPTCHA site

1. Open the Google reCAPTCHA admin console: <https://www.google.com/recaptcha/admin/create>.
2. Label: `ConvoLab practice`.
3. Type: **reCAPTCHA v2 → "I'm not a robot" Checkbox**. (The app renders the
   checkbox widget via `react-google-recaptcha`; a v3 or Invisible key will not
   work with it.)
4. Domains: `convolab.us`, `www.convolab.us`, and `localhost` (for local dev).
5. Submit, then copy the **site key** and the **secret key**.

## 2. Store the secret in Secret Manager

```bash
printf '%s' 'PASTE_SECRET_KEY_HERE' | gcloud secrets create RECAPTCHA_SECRET_KEY \
  --data-file=- --replication-policy=automatic --project=convolab-490517
```

(`printf '%s'` avoids a trailing newline in the stored value.)

### Access for the Cloud Run runtime service account

The service runs as `633459139926-compute@developer.gserviceaccount.com`. The
existing secrets (SESSION_KEY, etc.) have no per-secret IAM bindings; that
account holds `roles/secretmanager.secretAccessor` at the **project** level,
so the new secret is readable without further action. Check with:

```bash
gcloud projects get-iam-policy convolab-490517 \
  --flatten=bindings --filter="bindings.role:roles/secretmanager.secretAccessor" \
  --format="value(bindings.members)"
```

If that project-level grant is ever removed, grant it on this secret alone:

```bash
gcloud secrets add-iam-policy-binding RECAPTCHA_SECRET_KEY \
  --member=serviceAccount:633459139926-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor --project=convolab-490517
```

## 3. Deploy with both values

From the repo root, on the commit you want to ship:

```bash
gcloud builds submit --project=convolab-490517 --config=cloudbuild.yaml \
  --substitutions=_TAG=$(git rev-parse HEAD),_VITE_RECAPTCHA_SITE_KEY=PASTE_SITE_KEY_HERE,_RECAPTCHA_SECRET_REF=RECAPTCHA_SECRET_KEY:latest
```

Both substitutions must be passed on **every** deploy from now on (or set as
defaults on the Cloud Build trigger, if one is used). Leaving out
`_VITE_RECAPTCHA_SITE_KEY` builds a frontend with no checkbox; leaving out
`_RECAPTCHA_SECRET_REF` deploys a revision without the secret, and Start fails
closed again.

Do not pass `_RECAPTCHA_SECRET_REF` before the secret exists: Cloud Run
rejects a deploy that references a missing secret.

## 4. Verify

1. Open <https://convolab.us/> in a private window, pick a scenario, tick the
   checkbox, press Start; a practice conversation should open.
2. Confirm the revision has the secret:
   ```bash
   gcloud run services describe convolab-api --region=us-central1 \
     --project=convolab-490517 --format=yaml | grep -A3 RECAPTCHA
   ```

## Local development

With neither value set, the frontend skips the widget and the API accepts the
request (it only fails closed when `NODE_ENV=production`). To test the real
widget locally, put `VITE_RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` in
`.env`; `localhost` is on the site's domain list.
