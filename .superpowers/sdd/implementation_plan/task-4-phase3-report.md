# Task 4 Phase 3 Report

## Status
DONE

## What was implemented
- Updated `pigmie-web/src/shared/lib/api-client.ts` to include the `apiClient.collections.reverseCollection(id, data: { reason: string })` method.
- Created `pigmie-web/src/features/collections/components/collection-reversal-dialog.tsx` to handle the reversal logic (min 10 characters reason, triggers mutation, invalidates queries).
- Created `pigmie-web/src/features/collections/components/collections-table.tsx` from scratch (as it was missing in the project). Implemented the "Reverse Collection" dropdown action in the table, gated behind `org_admin` and `branch_manager` roles, and visible only for completed collections.

## Files changed
- `pigmie-web/src/shared/lib/api-client.ts`
- `pigmie-web/src/features/collections/components/collection-reversal-dialog.tsx` (created)
- `pigmie-web/src/features/collections/components/collections-table.tsx` (created)

## Test Results
- `npx tsc --noEmit` is passing with 0 errors.

## Self-review findings
- The codebase did not contain a `collections-table.tsx` component or the `components` sub-directory under `collections`. Therefore, both the folder and file were created from scratch based on user confirmation.
- The UI handles loading states properly during mutations, validates reason length locally, and displays toasts correctly using Sonner.

## Concerns
- Since `collections-table.tsx` was created from scratch and not mentioned anywhere else in the code, it is currently not being mounted in any specific page (such as `collections-today-page.tsx`). Integration of this table into the app views needs to be handled in a subsequent task.
