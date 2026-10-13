# Exact component accounting

Supported new contracts remain zero-fee by default. This change records principal, interest and fees separately for each payment allocation and each current installment, including exact reversal of earlier payments. It does not enable unapproved charges or fabricate historical paid components.

## Threat review before implementation

1. Access: current authenticated staff roles/tenant/branch/assignment checks remain authoritative inside posting transactions; no additional financial permission is introduced.
2. Modification: only the locked loan's installment paid components change alongside payment, loan totals and required audit. Original contract evidence is unchanged.
3. Forgery: payment identifiers remain durable; per-row evidence must have exact positive amount and nonnegative component strings summing to that amount. Scope and component totals are checked before reversal.
4. Malicious clients: the server computes components; clients cannot supply paid principal/interest/fees or change zero-fee policy. Unknown historical paid splits are not guessed to admit an operation.
5. Direct database access: component CHECK constraints require all-null historical evidence or three valid components summing to paid amount and bounded by charges. Browser-role grants remain denied.
6. Secrets: no new credentials or raw data logging; synthetic tests and aggregate verification only. Retained recovery artifacts stay encrypted and ignored.
7. Expiry: all existing MFA/session/current-actor admission controls and offline sync revalidation remain required.
8. Concurrency: payment/reversal/closure/restructure share the parent loan lock; installment updates and exact allocation evidence commit atomically. Bounded idempotent retry reuses the original operation identifier.
9. External failure: audit or component validation failure rolls back the financial transaction; confirmations remain after commit. Missing historical evidence produces an explicit reconciliation error rather than invented debt. Nonzero charge activation remains a separate approved-policy gate.

## Allocation policy

For a known installment, split a payment proportionally across its remaining principal, interest and fee balances. Round principal and interest to INR paise with half-up rounding, bound each by its outstanding component, then distribute the final rounding residual without exceeding any component. Store the actual component amounts in the payment's immutable row evidence. Reversal subtracts precisely those amounts; it does not recalculate today's proportions. Early closure uses those exact remaining components where available.

Historical rows retain three NULL paid components. A row with no paid amount can safely begin with three zero paid components when a new supported payment is posted; a row already containing an unknown combined payment requires source reconciliation. This does not infer original borrower terms or reconstruct old payments.

All non-waived installments are checked before posting or quoting, including previously paid rows that the new payment would skip. Invalid dates and nonfinite balances fail with a reconciliation error. Migration 0007 prevents a known paid-component triple from being erased back to NULL and rejects nonfinite known component balances.

Early closure records a separate immutable `early_closure` allocation with the receipt's principal, accrued interest, fees, penalty, waived amount and the exact source schedule. It preserves the installment rows' original charges and paid amounts while marking the remaining obligations waived. Component reports must combine regular allocation rows with the settlement summary; summing only installment paid components omits settlement receipts. Regular payment reversal continues to reject settled loans because a settlement adjustment requires its own reviewed workflow. Current-period interest is accrued from the original interest and then reduced by recorded interest payments, with a zero floor.

Verification includes paise rounding, exact earlier-payment subtraction, historical admission, invalid values/dates, settlement evidence, and provider-diagnostic suppression. An independent review exercised 17,496 valid small-value allocation invariants without a rounding failure. Final live staging evidence is recorded in the four-package execution document.
