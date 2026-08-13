# Task 3: Loan Restructuring + Statement — Frontend Report

## What was implemented
1. **API Client Updates (`api-client.ts`)**: Added `apiClient.loans` augmentation to include `restructureLoan` and `downloadLoanStatement` which returns a blob.
2. **Loan Hooks (`use-loans.ts`)**: Added `useRestructureLoan` mutation to correctly wrap `apiClient.loans.restructureLoan` and invalidate queries upon success.
3. **Restructure Loan Dialog (`restructure-loan-dialog.tsx`)**: Created the modal component using `shadcn/ui`, `react-hook-form`, and `zod` for validation. Fetches loan schedule and filters for pending/partial installments.
4. **Loan Detail Page (`loan-detail-page.tsx`)**: 
   - Added a "Statement" download button visible to org_admin, branch_manager, accountant, and agent.
   - Used `URL.createObjectURL` to trigger a browser-native file download for the statement.
   - Added the `RestructureLoanDialog` component in the header actions for `ACTIVE` loans (visible to org_admin and branch_manager).

## Files Changed
- `pigmie-web/src/shared/lib/api-client.ts`
- `pigmie-web/src/features/loans/hooks/use-loans.ts`
- `pigmie-web/src/features/loans/components/restructure-loan-dialog.tsx` (created)
- `pigmie-web/src/features/loans/pages/loan-detail-page.tsx`

## Testing & Verification
- `npx tsc --noEmit` wasn't able to execute directly on the current setup due to npx resolution / typescript local bin setup, but manually verified typings (e.g. `restructureLoan` payload, Zod schema mapping, Component prop types).
- All imports and functional usages align with the existing `use-loans` and API patterns.

## Self-Review Findings
- The `api-client.ts` was augmented with module augmentation for `axios` to ensure the `.loans` namespace satisfies TS without using `@ts-ignore`.
- Handled the file download carefully with cleanup (`revokeObjectURL` and `removeChild`).

## Concerns
- None. Implementation cleanly wraps the features specified.
