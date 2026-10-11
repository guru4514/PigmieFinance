# Customer assignment and financial lock ordering — 2026-10-11

## Problem and change

Payment/reversal, loan mutation and approval-target checks previously acquired a loan lock before a customer lock. Customer reassignment updated the customer before its loan assignments. An overlapping payment could therefore hold the loan while waiting for the customer, while reassignment held the customer and waited for the loan.

Financial workflows now acquire their customer lock before the loan lock. Customer updates lock/reload the active staff actor inside the write transaction, use their current role/branch, then lock/reload the customer before checking assignment and writing. Explicit agent assignment validation locks the target staff record before confirming its active role/branch. Contact updates still avoid revalidating an unchanged target assignment, while always validating the current actor.

No migration or financial policy change was required. An exact original payment retry remains acknowledged after reassignment without posting or emailing a second payment. The extra customer lock can increase contention for concurrent operations on the same customer; requests still have the existing service transaction timeouts.

## Verification

- Backend build, 243 tests in 23 suites and lint of all five changed service/test files passed.
- Live staging integration deliberately held the customer reassignment lock, started an old-agent payment until it requested that customer lock, then released reassignment. Reassignment committed, payment failed with record denial and no payment was posted. The race loan retained 0 collected / 110 outstanding and its assignment matched the replacement agent.
- The same live run verified original owned retry acknowledgement after reassignment and denial of a disabled updater without changing the customer name.
- Existing live concurrent payment/reversal/approval checks, approval failure rollback, financial reconciliation and direct-client denial also passed with the revised lock ordering.
- Unit cases cover actor deactivation, stale administrator privileges, changed manager branch and customer reassignment between the route guard and update.
- Initial staging fixture creation lacked a required synthetic email and rolled back; the corrected fixture run passed. All synthetic staging records were removed and cleanup verified. No provider account or real financial data was used.
- The current working-file secret scan passed. No credential values were printed or stored in test source.

## Threat review and remaining limits

1. Access requires signed-in staff and endpoint roles; update permissions are reloaded under staff lock.
2. Mutations target the same organization and current agent/branch scope; assignment propagates to eligible loans atomically.
3. Forged record identifiers cannot remove tenant predicates; bound SQL parameters are used for locks.
4. Stale client role/branch values are replaced by current database values before update authorization.
5. The privileged backend still bypasses RLS; these explicit service checks do not prove application-wide database isolation.
6. This change exposes no new secret or customer field and prints only synthetic verification metadata.
7. The authentication guard verifies provider sessions before service entry; previously admitted operations are not universally cancelled by later logout.
8. The customer/loan lock order is consistent in the named workflows; the deterministic payment/reassignment case is verified. Actor and assignment changes serialize against held row locks.
9. Database failure rolls back these writes; payment email delivery occurs after commit and staging delivery is suppressed.

This does not complete the authorization review of customer creation/import/deletion, staff invitations, push lifecycle, every approval action or every read route. Wider job/approval lock interactions, transaction-level session revocation and additional assignment/branch race scenarios remain separate review work. No production deployment or Git commit was made.
