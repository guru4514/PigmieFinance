# Device and platform recovery acceptance

These checks remain release evidence requirements; source tests do not substitute for real device results. Use staging and synthetic accounts only. Never paste access tokens, passwords, recovery keys, signed links or customer data into evidence logs.

| Scenario | Required evidence | Current result |
| --- | --- | --- |
| Fresh installed web app, connectivity lost before restart | App shell opens; access state is clear; saved owner queue is recoverable; no invented server confirmation | Profile query now attempts offline instead of remaining paused, times out after 10 seconds and offers retry without clearing queues; physical exercise remains open |
| Payment saved then process/browser killed | Same identifier/payload/photo survive; retry produces one server payment | Automated outbox cases pass; device check open |
| Account switch before/during sync | Second account cannot see/replay first account's records; original queue remains | Automated cases pass; device check open |
| Payment acknowledged, evidence upload/registration interrupted | Receipt remains truthful; retry finishes same evidence; no duplicate debt/cash | Automated and live API cases pass; device check open |
| Storage quota/eviction/site-data deletion | Failed save is visible; no false success; operational recovery limitation is explicit | Real browser/device check open; deleted unsynced data is not recoverable from server backup |
| Service worker upgrade while queue exists | Durable queue remains; business responses never come from another account's shared cache | Build/source controls checked; upgrade exercise open |
| Lost MFA device/global revocation | Protected access denied; operator recovery requires new factor; old access/refresh sessions fail | Provider/API synthetic checks passed; browser/operator exercise open |
| Backup copied off-site, local copy unavailable | Independently retrieved ciphertext authenticates; separately stored key works; wrong key/tampering fail | Local authentication/restore passed; off-site retrieval open |
| Complete recovery to separate staging deployment | Database/history, Auth identities/MFA, Storage blobs/ownership, API/settings and application PII decrypt all verified together | Fifty application/Auth/Storage metadata tables and development archived history restored identically on isolated PostgreSQL; provider runtime, blobs, owner/ACLs, settings and full-platform restore remain open |

Retain test case, app/build version, device/browser/OS version, timestamps, outcome and redacted failure category. Record the first unsynced item before intentional interruption; do not clear real queues or reset production. Use a disposable synthetic queue for eviction exercises. Complete any failed scenario and verify fixture/object/provider cleanup before treating the corresponding package as passed.
