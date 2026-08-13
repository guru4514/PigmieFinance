# Task 1: Loan Restructuring — Backend - Report

## What was implemented
- Created `RestructureLoanDto` in `restructure-loan.dto.ts` with `fromInstallmentNumber`, `newTenure`, and `reason`.
- Implemented `restructure()` method in `loans.service.ts`:
  - Validates active loan status and target row status.
  - Deletes pending rows starting from `fromInstallmentNumber`.
  - Calculates remaining principal using deleted `principalComponent`s.
  - Generates new rows with `generateSchedule()`, calculates correct initial `startDate`, and offsets `installmentNumber`s appropriately.
  - Recalculates and updates `Loan` totals (`totalPayable`, `outstandingBalance`, `tenure`, `expectedEndDate`) and saves to DB.
  - Creates a transaction-wrapped audit log of the operation.
- Added `POST /:id/restructure` endpoint in `loans.controller.ts` with appropriate Role and Audit decorators.

## What was tested
- Compiled code with `npx tsc --noEmit` and resolved all type errors (via generating Prisma client).

## Test Results
- Compilation succeeds cleanly without errors.

## Files Changed
- `pigmie-api/src/modules/loans/dto/restructure-loan.dto.ts` (created)
- `pigmie-api/src/modules/loans/loans.service.ts` (modified)
- `pigmie-api/src/modules/loans/loans.controller.ts` (modified)

## Self-Review Findings
- Implementation closely follows the requirements.
- Edge case where `fromInstallmentNumber = 1` is correctly handled by falling back to `loan.startDate` as `prevDueDate`.
- Correct math operations are applied for updating loan's total payable, subtracting deleted rows and adding newly generated ones.

## Issues or Concerns
- The instructions mention "plus any outstanding late fees" when calculating the remaining principal, however the Prisma schema does not model late fees natively in `LoanSchedule`. Thus, only the sum of deleted rows' `principalComponent` is used.
- Assumed `totalPayable` logic doesn't require modifying historical rows.
