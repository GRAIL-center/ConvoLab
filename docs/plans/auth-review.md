# Auth Implementation Review

Post-implementation review of Phase 2 OAuth. Consolidated from multiple review documents.

## Test Coverage Summary

**18 tests across 2 files:**
- `handlers.test.ts` - 8 tests covering `handleGoogleAuth`
- `merge.test.ts` - 10 tests covering `mergeUsers` and merge scenarios

### Well Covered
- New user creation (User + ExternalIdentity + ContactMethod)
- Returning user login (finds by ExternalIdentity, updates lastLoginAt)
- Anonymous → authenticated linking (preserves user ID, upgrades GUEST → USER)
- All merge relation transfers (ConversationSession, Invitation.linkedUserId, ObservationNote, UsageLog)
- Security-critical: prevents account takeover when session user already has identities
- Multiple Google accounts per user

### Not Tested
- `/api/auth/me` endpoint logic (mergedFrom clearing, deleted user handling)
- `/api/auth/logout` endpoint
- HTTP-level integration tests for routes

## Outstanding Issues

### Resolved

**1. ContactMethod Ownership Transfer** ✓

OAuth providers are authoritative for email ownership. If another user manually added an email (unverified), it transfers to the authenticated owner when they log in. Documented in code comment at `handlers.ts:198-200`.

**2. Invitation.createdById FK Risk** ✓

Added `createdById` transfer to merge function alongside `linkedUserId`. Now handles both creator and recipient links.

**3. Self-Merge Edge Case** ✓

Added guard: `if (sourceUserId === targetUserId) return;`

**4. ContactMethods Lost During Merge** ✓

Non-conflicting ContactMethods are now transferred during merge. Duplicates (same type+value) are dropped. Transferred contacts have `primary: false` to avoid conflicts.

## Architecture Notes

### What's Good
- Business logic in `handlers.ts` is testable without HTTP
- Plugins properly encapsulated (`session.ts`, `oauth.ts`)
- Merge logic is atomic (transaction)
- Session security: httpOnly, sameSite=lax, secure in prod, 7-day expiry

### Minor Style Issues (Optional)
- `routes/auth.ts:65,71`: Unused `_reply` parameters
- OAuth misconfiguration returns JSON (line 19), could redirect like other errors
