# Web and device recovery verification — 11 October 2026

## Implemented protections

- Offline cold start opens the cached application shell and a recovery screen. It shows only the number of queued collections belonging to the local session's identity. It does not reconstruct staff roles, display borrower/payment details, permit collection creation, or synchronize without fresh server authorization.
- The account bootstrap response is validated before it can establish a workspace. Malformed objects, HTML fallback pages and unsupported roles produce recovery instead of an empty redirect loop. Backend authorization remains authoritative.
- Account changes discard previous-account query data without deleting the separately owned IndexedDB outbox. Queue counts change with the identity; returning to the original identity finds its original records.
- Storage access errors are distinguished from a confirmed zero count. The UI advises the original browser profile and never claims that inaccessible records were deleted.
- Service-worker upgrades wait for an explicit reload action. The prompt tells the user to finish or save the form first. Activating an update does not clear the outbox. The API continues to use NetworkOnly caching.
- The error boundary no longer prints raw exception/request objects or renders their messages. Existing application console errors now use fixed messages without raw request/error objects because upstream errors may contain credentials or personal information.
- Existing queue protections remain: durable write before transmission, original operation identifiers on retry, owner validation, exact server acknowledgement validation, retained photo evidence after interrupted delivery and no automatic reassignment of unknown historical records.

## Threat review before verification

1. **Access:** a local session can view its own queue count only; a currently resolved staff identity and API authorization are required to synchronize.
2. **Modification:** recovery changes no payments, owners or roles. The browser test touches a new synthetic browser profile exclusively.
3. **Forged requests:** a fabricated local identity or token cannot grant API access. The browser harness deliberately uses dummy tokens and intercepts API calls with failure responses.
4. **Malicious client:** UI hints and JSON validation do not replace backend token, assurance, tenant and assignment enforcement.
5. **Direct database access:** browser IndexedDB contains the existing outbox; no export or new payment-data cache is introduced. Device-profile access is a separate security boundary.
6. **Secrets:** the harness builds with dummy settings, blocks the dummy auth provider and outputs only test results or boolean diagnostic state. It never uses real environment credentials. Raw error objects are removed from the affected error boundary.
7. **Expiry:** recovery cannot authorize new work from cached roles. Expired/revoked sessions need server/provider recovery; local records remain preserved.
8. **Concurrency:** existing per-owner synchronization locks and server idempotency remain. Updating the application requires an explicit action and cannot automatically interrupt an edited payment form.
9. **External failure:** offline or malformed account bootstrap reaches a recovery screen. Unavailable storage is reported without claiming missing records. Payment/evidence failures retain the original retry operation.

## Actual desktop Chromium checks

Run `npm run test:browser-recovery` in `pigmie-web` with a locally installed Chrome/Edge browser. The harness builds a dummy-config application, runs a loopback preview, creates an isolated profile under ignored `.recovery`, uses one synthetic IndexedDB row, and closes/removes its own profile afterward. It does not access the user's existing browser profiles or Supabase projects. Generated `dist` contains dummy test configuration until the next normal build.

Verified in the installed headless Chrome browser:

| Scenario | Observed result |
| --- | --- |
| Offline navigation after initial shell installation | Cached shell opens the recovery screen and shows one saved collection for the original account |
| Switch to a different synthetic account | Zero records shown for that identity; original queue retained |
| Switch back | Original saved count returns |
| Close the entire browser process, restart with the same profile offline | Original queue and recovery screen survive |
| Install a new service-worker version | Waiting worker remains pending until the visible Reload now action; the queued record survives activation |
| Delete the isolated synthetic IndexedDB database | Recovery reports zero local records; no fabricated restore or posting occurs |

Initial harness attempts found two harness timing issues (first-install worker control and stale debugger-port discovery). They were corrected. Offline verification also found a malformed account response causing a blank redirect loop; response-shape validation fixed the application failure. The final complete harness passed all scenarios with profile cleanup.

Final automated checks: 75 web tests across nine files passed; TypeScript/production build passed; lint completed with zero errors and five existing warnings. The existing large-bundle warning remains. Script syntax validation passed.

## Verification boundary

This is real desktop-browser storage/service-worker verification, not physical Android/iOS testing. It proves safe offline recovery of already queued work, not creation of new collections after an offline cold start. Granting fresh collection permissions from cached roles would weaken the authorization boundary.

The following require actual hardware/provider environments: installed Android and iOS PWA lifecycle, OS eviction under storage pressure, camera/GPS permissions and interrupted native capture, real authenticator UI recovery on separate physical devices, and recovery from an independently stored backup. A server backup cannot reconstruct an unsynchronized outbox erased from the only device that held it. Those scenarios must not be labelled passed based on the desktop harness.
