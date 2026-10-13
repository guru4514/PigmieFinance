# Staff MFA recovery and session revocation — 2026-10-11

## Fix and verification

The live staging check reproduced a gap: after global sign-out, the refresh token failed but the already issued second-factor access token still returned HTTP 200 on the staff API.

The API now validates every authenticated request against provider-owned `auth.sessions` and `auth.users`. The session must belong to the token identity, exist, not exceed its explicit `not_after` value, and belong to a user without a current provider ban. Missing/invalid session identifiers and ended/deleted sessions return HTTP 401 before application actor resolution. Lookup failures return a generic HTTP 503 and fail closed. Staff business access also requires a verified provider factor alongside signed `aal2` assurance. Explicit bootstrap remains available with an active provider session for enrollment.

Queries use bound UUID parameters and do not write provider tables. Before restricting the backend database role, verify its required SELECT privileges on these provider tables. Never grant those privileges to browser roles.

Live staging checks passed for password-only denial/profile bootstrap, provider TOTP acceptance, old first-factor denial, inactive staff denial, global sign-out across two sessions, refresh rejection, lost-factor removal, operator session revocation, mandatory fresh enrollment, restored access and rejection after provider identity deletion. Synthetic provider/database fixtures were removed. Backend build, 239 tests in 23 suites and focused guard/HTTP-test lint passed. The initial focused HTTP tests were blocked by sandbox socket restrictions; the full run passed with localhost enabled.

## Operator-assisted lost-device recovery

This is a trusted-operator procedure, not a password-only MFA bypass. The organization administrator must escalate to an authorized provider operator if they lack provider privileges. No organization-admin recovery endpoint or self-service recovery-code feature was added.

1. Independently verify the requester and organization under the approved recovery policy. Record authorization without passwords, OTPs, factor secrets or tokens.
2. Suspend the correct application staff account while recovery is in progress. This denies subsequent staff requests; it cannot cancel every previously authorized in-flight operation.
3. Use authorized Supabase operator tools to remove the lost factor and revoke all sessions for that user. Factor deletion alone is insufficient. Confirm revoked session denial; refresh failure alone does not establish access-token denial.
4. Retire obsolete custom MFA setup data through reviewed maintenance if present. No stored legacy secrets existed in the checked development/staging databases. Keep mandatory provider MFA enforcement enabled.
5. Re-enable the correct staff account after identity verification and operator recovery. The user signs in again and enrolls/verifies a new authenticator through the normal application. Password-only business access remains denied.
6. Confirm restored access, rejection of the deleted factor and denial of old sessions. Record the outcome using the organization's approved process.

Never share enrollment QR codes, factor secrets or tokens through chat, documentation, support logs or screenshots.

## Repeat and limitations

Run `node scripts/check-staging-mfa.mjs` from `pigmie-api` with the isolated staging API on port 3001. The script accepts only the fixed staging reference and creates/removes a disposable provider account without invitation email. Secrets stay in memory or ignored configuration; output contains metadata only.

Session validation denies subsequent API admission, not already authorized transactions, downloaded/offline data or requests to other services that independently accept JWTs. Provider inactivity and other session policies need separate review; this change checks only the explicit `not_after` deadline. A revoked browser may retain a local session until its next request/refresh; API denial is verified, while browser recovery UX remains pilot work. No production rollout or provider settings changes were performed.

Threat review: bearer/signature validation precedes bound session queries; staff scope comes from application records; missing sessions/deleted users cannot become onboarding users; forged or stale assurance cannot bypass factor enforcement; database failure fails closed; no token/factor output; concurrent requests already admitted before revocation remain a documented limit.

References: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [sign-out behavior](https://supabase.com/docs/guides/auth/signout), [MFA enforcement](https://supabase.com/docs/guides/auth/auth-mfa).
