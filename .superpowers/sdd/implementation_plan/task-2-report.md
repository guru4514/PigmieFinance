# Task 2 Report: Fix `totalPayable` Drift (Issue #2)

## Implemented
- Updated `pigmie-api/src/jobs/scheduled-jobs.service.ts` inside `markOverdueInstallments()`.
- Added logic to track `fee` when calculating late fees for overdue schedule rows.
- Added `tx.loan.update` call when `fee > 0` to increment `totalPayable` and `outstandingBalance` on the parent loan record (`where: { id: row.loan.id }`).
- Created unit tests in `pigmie-api/src/jobs/scheduled-jobs.service.spec.ts` covering fee application (incrementing totals) and 0 fee scenario (skipping loan update).

## Verification & Testing
- **TypeScript compilation**: `cmd /c npx tsc --noEmit` passed with 0 errors.
- **Unit tests**: `cmd /c npm test` passed all 2 test suites (6 tests total).

## Files Changed
- `pigmie-api/src/jobs/scheduled-jobs.service.ts`
- `pigmie-api/src/jobs/scheduled-jobs.service.spec.ts`

## Self-Review Findings
- Changes are minimal, isolated, and precisely target Issue #2 as specified in the task brief.
- Clean handling of conditional loan updates (only executing loan increment when `fee > 0`).

## Issues or Concerns
- None.
