# Task 2: Fix `totalPayable` Drift (Issue #2)

**Goal:** Sync the loan totals when late fees are applied by the cron job.

**Context:** The daily cron job in `pigmie-api/src/jobs/scheduled-jobs.service.ts` adds late fees to `loanSchedule.dueAmount` but forgets to increase the parent loan's `totalPayable` and `outstandingBalance`. Over time, this causes the schedule sum to drift from the loan totals.

**Requirements:**
1. Modify `pigmie-api/src/jobs/scheduled-jobs.service.ts`.
2. Find the loop inside `markOverdueInstallments` where the late fee is applied to `newDueAmount`.
3. Add a Prisma update statement using `tx.loan.update` to increment `totalPayable` and `outstandingBalance` on the parent loan by the `fee` amount.
4. The Prisma query should update `where: { id: row.loan.id }` with `data: { totalPayable: { increment: fee }, outstandingBalance: { increment: fee } }`.

**Execution Constraints:**
- Must compile without TypeScript errors (`npx tsc --noEmit`).
- Keep changes minimal and isolated to this fix.
