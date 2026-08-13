# Task 3: Loan Restructuring + Statement — Frontend

**Files:**
- Create: `pigmie-web/src/features/loans/components/restructure-loan-dialog.tsx`
- Modify: `pigmie-web/src/features/loans/pages/loan-detail-page.tsx`
- Modify: `pigmie-web/src/shared/lib/api-client.ts`

**Interfaces:**
- Consumes: React Query, React Hook Form, shadcn/ui components (`Dialog`, `Button`, `Form`, `Input`, `Select`)
- Produces: API integrations for the restructuring and statement downloading features built in Tasks 1 and 2.

**Implementation Details:**
- **Step 1: API Client Updates**
  - Add `restructureLoan(id, data: { fromInstallmentNumber, newTenure, reason })` to `apiClient.loans`.
  - Add `downloadLoanStatement(id)` to `apiClient.loans`. This should return the blob/buffer and initiate a file download in the browser.

- **Step 2: Restructure Dialog (`restructure-loan-dialog.tsx`)**
  - Create a modal dialog with a form.
  - Form Fields:
    - `fromInstallmentNumber`: Select dropdown (or number input) restricted to `pending` installments (derived from `loan.schedule`).
    - `newTenure`: Number input (min 1).
    - `reason`: Textarea (optional).
  - On submit: Call `restructureLoan` via a mutation. Show a toast on success, invalidate the `loan` query to refresh the detail view, and close the dialog.
  - The dialog should receive `loan` as a prop so it knows the schedule.

- **Step 3: Update `loan-detail-page.tsx`**
  - Add a "Restructure Loan" button in the page header actions (only visible if the loan is active and the user is `org_admin` or `branch_manager`).
  - Add a "Download Statement" button in the header actions (visible to `org_admin`, `branch_manager`, `accountant`, `agent`).
  - Clicking "Download Statement" calls the `downloadLoanStatement` API and triggers the file save.
  - Hook up the `RestructureLoanDialog` to the button.

**Execution Constraints:**
- When triggering the download, use `window.URL.createObjectURL(blob)` and a temporary `<a>` tag to force the browser to download the file.
- Verify with `npx tsc --noEmit`.
