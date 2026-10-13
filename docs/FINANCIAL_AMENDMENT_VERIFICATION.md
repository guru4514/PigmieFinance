# Immutable financial amendment verification

## Threat review before implementation

1. Access: existing MFA-authenticated administrator/branch manager admission and current staff/customer/loan scope remain authoritative inside the transaction.
2. Modification: only unpaid, unwaived, zero-fee replacement installments can change. A new append-only loan amendment stores exact old/new snapshots and original terms; historical NULL terms remain unknown.
3. Forgery: validated integer DTO, scoped locked loan, actor checks and database tenant-link checks reject forged loan/staff identities. No new endpoint is introduced.
4. Malicious client: backend reconciles all components and totals, rejects paid replacements and excessive tenure, and assigns the version itself; clients cannot submit versions or evidence.
5. Direct queries: RLS plus denied browser grants protect evidence. A trigger rejects updates and direct deletes; parent loan/organization cascade deletion permits existing scoped synthetic cleanup. Privileged operators can alter database enforcement and remain outside this guarantee.
6. Secrets: evidence contains internal identifiers and contract money, no credentials/customer contact details. Evidence is not logged; backup encryption and existing scope controls remain required.
7. Expiry: existing API authentication/MFA admission applies; transaction actor activity and branch scope are rechecked. No cached-role or expired-session bypass is added.
8. Concurrency: existing loan row lock serializes payments/restructuring and version allocation; database uniqueness prevents duplicate loan versions. Amendment insertion and mandatory audit share the financial transaction, rolling back together.
9. External failure: no external service is called in this transaction. Database/audit failure aborts replacement and amendment. Borrower disclosure/acceptance is explicitly not evidenced; a staff operation must not be labelled borrower consent.

## Design

Add an append-only `loan_amendments` table with loan/organization/actor identity, monotonic per-loan version, operation/reason, exact before/after JSON evidence and timestamp. Each snapshot preserves affected schedule IDs, dates, exact decimal strings and balances. Initial original financial terms are retained in the before snapshot. No historical amendments are inferred/backfilled. Amendment version counts recorded amendments only, not presumed historical revisions. Parent deletion remains an explicit retention limitation, not perpetual ledger retention.

## Implementation evidence

The additive 0006 migration creates no historical versions. Browser roles have no table privileges; application-role grants are SELECT/INSERT only. An INSERT trigger validates organization context, current actor role/activity/branch-to-customer scope, the loan tenant, and consecutive versions while locking the loan. UPDATE and direct DELETE are rejected. Loan/organization cascade deletion remains permitted to support existing scoped synthetic cleanup; parent retention must be managed independently.

Restructuring writes durable before/after evidence and the mandatory linked audit in the same transaction, preserving affected schedule identities, exact decimal strings and dates. Ledger insertion failure propagates; audit failure remains a transaction failure. The audit links immutable amendment ID/version. `borrowerAcceptance: not_recorded` prevents staff administration from being presented as customer consent.

Original principal, interest type/rate and collection frequency must match immutable initial terms before disbursement, closure/quote and restructuring. Disbursement additionally requires original tenure. Later operations require current tenure to match the latest recorded amendment, or original tenure where no recorded amendment exists. Historical NULL contracts remain explicit unknown evidence; no modern contract is retroactively invented.

Focused regression/build/lint evidence is combined with the root component-accounting integration checks below. Database enforcement has now been rehearsed and deployed as described below.

Final focused verification: nine restructuring tests and nine original-terms tests passed (18 total); backend build and focused ESLint passed. The restructuring tests include exact unknown/known component snapshots, next-version allocation, insertion/audit failure propagation, rate drift rejection, changed-tenure evidence admission and hidden component-payment rejection. New disbursement/restructure rows initialize paid principal/interest/fees to exact zero; historical source snapshots preserve NULL rather than fabricated allocation. Actor identity uses NO ACTION on deletion, allowing complete parent cascades to resolve within a statement while preventing independent staff deletion from destroying linked identity evidence. The live database checks below establish the corresponding trigger, scope and cascade behavior.

## Live database verification — 13 October 2026

A fresh encrypted development snapshot was restored into disposable loopback PostgreSQL. All 50 public/Auth/Storage tables, constraints, indexes, policies, functions and triggers matched the source; privately archived original migration history was also restored. The final 0006/0007 SQL was rehearsed on this exact restored copy and rolled back. No plaintext dump was written. The retained pre-deployment recovery artifact is `.recovery/backup-1b66396a-be5c-410e-9c05-4fa1bb7e5d0e`; its key is restricted and ignored separately within the local recovery directory, and this local arrangement does not establish independent off-site key escrow.

The same final SQL passed a rolled-back staging rehearsal and a development rehearsal. Synthetic rows proved UPDATE/direct DELETE rejection, skipped and duplicate version rejection, successful consecutive versions, cross-tenant/foreign/inactive/agent actor rejection, malformed evidence rejection, preservation of actor identity on independent staff deletion, and both loan and organization parent cascades. Browser table privileges were all denied; application privileges were exactly SELECT/INSERT, including explicit revocation of any inherited default grants.

Component database checks rejected inconsistent sums, partial NULL triples, negative amounts, non-finite amounts and erasure of a recorded triple into all NULL. Valid exact payment components were accepted. Historical rows were not assigned inferred splits.

Both environments then received 0006/0007 through guarded `prisma migrate deploy`, with all seven recorded checksums verified. Development deployment required a less-than-24-hour successful restore proof whose exact catalog, data, original history, archived history and migration-file digests still matched the live source immediately before deployment. A separate read-only post-deployment verification proved every original public row unchanged after projecting away only the three newly added NULL columns and the empty new table; existing Prisma records and private archived history matched the pre-deployment backup exactly. No historical amendment was fabricated.

Final read-only Prisma status was up to date and the schema diff was empty in both development and staging. Development also had no missing modeled tables/columns; all 15 application tables, including the new amendment table, had RLS enabled and denied browser-role table access. Database constraints/triggers are verified by the explicit rehearsal rather than inferred from Prisma's schema diff, which does not model their full semantics.

Commands: `deploy-financial-evidence.mjs --staging --apply`; `deploy-financial-evidence.mjs --development <verified-backup-directory> --apply`; `verify-financial-evidence-data.mjs <verified-backup-directory>`. These are guarded additive migration tools, not remote reset or history-rewriting tools. The original deployment scripts for earlier one-shot migrations must not be reused for this stage. Provider/runtime ownership, Storage blobs, off-site durability and actual borrower acceptance are separate verification scopes.
