# Phase 0: Doc Cleanup

Remove all SAML/Passport.js/email-password auth references. Update to Google OAuth + invitations model.

## Files to Update

### conversation-coach-architecture.md
- Line 17: Remove "Passport.js (auth: email + Purdue SAML)"
- Line 33-34: Remove Passport.js from stack
- Lines 242-248: Rewrite auth section → Google OAuth + invitations
- Remove all SAML_* env var references
- Update data model section with new User/Invitation schema

### README.md
- Line 146: Update TODO list (remove "Passport.js with email + SAML")
- Remove any SAML/Purdue SSO references

### packages/api/README.md
- Lines 18-19: Remove "Passport.js: Authentication (email + SAML)"
- Lines 36-39: Remove auth directory structure refs
- Lines 74-100: Update env vars section (remove AUTH_METHOD, SAML_*)
- Lines 217-225: Rewrite auth section
- Lines 382-387: Update priority order

### .env.example
- Remove: AUTH_METHOD, SESSION_SECRET, SAML_*
- Add: SESSION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL

## New Auth Summary (for docs)

```
Auth: Google OAuth via @fastify/oauth2
Sessions: Stateless encrypted cookies (@fastify/secure-session)
Guest access: Invitation links with token quotas
Progressive auth: Guests can link to Google account
```
