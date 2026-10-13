# Dashboard metric definitions and verification

The reviewed defect divides all cash receipts today by only the remaining unpaid amount due today. An installment of INR100 with INR50 paid therefore displays 100%, and an unrelated arrears/prepayment receipt can inflate that result. The replacement metric measures fulfillment of installments scheduled for today's Indian business date: recorded installment paid amount divided by the full non-waived scheduled amount. Prepayment counts toward fulfillment; unrelated receipts do not. Fully paid rows remain in the denominator after automatic loan closure. No due installments means 0%, not invented fulfillment.

`dueToday` remains the unpaid remainder of today's installments. `collectedToday` remains recorded/verified receipts dated today. These are different financial populations and must not be divided to claim collection performance. Outstanding and risk include active/defaulted debt; `activeLoans` retains the count of active loans. Overdue account count measures loans, not installment count, and derives lateness from the Indian business date rather than waiting for a scheduled job.

## Threat review before implementation

1. Access: current authenticated staff/tenant/branch/assignment resolution remains required inside the report transaction.
2. Modification: these changes affect only read calculations and explanatory labels; no money, terms, assignment or historical data is altered.
3. Forgery: caller-supplied roles/branches remain ignored in favor of current staff scope.
4. Malicious client: server computes the numerator/denominator; clients cannot submit financial report totals.
5. Direct database: existing grants and RLS are unchanged. Runtime least privilege is audited separately.
6. Secrets: tests use synthetic balances and identifiers; no raw database rows or provider diagnostics are printed.
7. Expiry: existing authentication/MFA admission remains authoritative; no cached permission fallback is introduced.
8. Concurrency: the dashboard and portfolio-risk reports use repeatable-read transactions for consistent snapshots. Other report workflows retain their existing transaction behavior.
9. Failure: invalid/nonfinite/negative/inconsistent monetary values produce a reconciliation error rather than a plausible incorrect percentage. No source data is repaired from the report.

Twenty-six report tests pass, including partial/full/no-due fulfillment, unrelated receipts, exact paise sums, invalid balances/risk, Indian midnight/month boundaries, current actor scope and transaction options. The full combined staging finance check passed with actual PostgreSQL field-reference filters and risk SQL. New synthetic loans with INR200 due today and INR150 paid toward them add only INR50 remaining due; an unrelated INR10 arrears receipt changes today's receipts but not installment fulfillment. Fully paid closed rows remain included. A zero-due row with stale pending status is excluded from overdue counts and lists. Dashboard and portfolio risk agree with separately computed scoped risk amounts.

The first expanded fixture run exposed an audit assertion that counted all organization settlements rather than the one rollback target. The assertion now filters the target loan. A later startup connection failure created no fixtures; a read-only connection check passed and the successful integrated run followed. Every created fixture and uploaded object was removed with absence verified. No financial rule or permission was relaxed to make the check pass.

The metric card now explains this definition in English and Hindi. This definition does not establish contractual borrower consent or independent bank settlement, nor certify all report populations. Cumulative agent-performance/efficiency reports retain their separate definitions and need their own review.
