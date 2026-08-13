# Task 4: Collection Reversal UI

**Files:**
- Create: `pigmie-web/src/features/collections/components/collection-reversal-dialog.tsx`
- Modify: `pigmie-web/src/features/collections/components/collections-table.tsx`
- Modify: `pigmie-web/src/shared/lib/api-client.ts`

**Interfaces:**
- Consumes: React Query, shadcn/ui components (`Dialog`, `Button`, `DropdownMenu`)
- Produces: API integrations for `POST /api/v1/collections/:id/reverse`.

**Implementation Details:**
- **Step 1: API Client Updates**
  - Add `reverseCollection(id, data: { reason: string })` to `apiClient.collections`.

- **Step 2: Collection Reversal Dialog (`collection-reversal-dialog.tsx`)**
  - Create a modal dialog with a form.
  - Form Fields:
    - `reason`: Textarea (required, min 10 chars)
  - On submit: Call `reverseCollection` via a mutation. Show a toast on success, invalidate `collections` and `loans` queries, and close the dialog.

- **Step 3: Update `collections-table.tsx`**
  - In the actions column for each row (using `DropdownMenu`), add a "Reverse Collection" option.
  - This option should only be visible for `org_admin` or `branch_manager` roles, and only if the collection status is `COMPLETED` (or whatever the successful status is).
  - Hook up the `CollectionReversalDialog` to this action.

**Execution Constraints:**
- The backend reversal logic `reverse()` in `collections.service.ts` was supposedly already implemented in Phase 2 or Tech Debt, but if it wasn't, you do NOT need to implement it. This task is purely for the UI.
- Verify with `npx tsc --noEmit`.
