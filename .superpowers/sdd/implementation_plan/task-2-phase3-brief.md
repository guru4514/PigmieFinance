# Task 2: Loan Statement PDF — Backend

**Files:**
- Create: `pigmie-api/src/modules/loans/pdf.service.ts`
- Modify: `pigmie-api/src/modules/loans/loans.module.ts` (provide PDF service)
- Modify: `pigmie-api/src/modules/loans/loans.controller.ts` (add `GET /:id/statement`)

**Interfaces:**
- Consumes: `pdfkit` (needs to be installed), `TenantPrismaService`
- Produces: `GET /api/v1/loans/:id/statement` — returns a PDF stream (`application/pdf`) containing the loan summary, schedule, and collection history.

**Implementation Details:**
- **Step 1: Install `pdfkit`**
  - Run `npm install pdfkit @types/pdfkit` in `pigmie-api`.

- **Step 2: Create `pdf.service.ts`**
  - Create a NestJS service with a `generateLoanStatement(loanId: string, orgId: string): Promise<Buffer>` method.
  - Fetch the Loan, its `customer`, `schedule` (ordered by `installmentNumber`), and `collections` (ordered by `collectionDate`).
  - Use `pdfkit` to draw a professional statement:
    - Header: Organization Name (mock or fetch from org table if it exists), "Loan Statement".
    - Customer Info: Name, Phone.
    - Loan Info: Principal, Interest, Tenure, Start Date, Expected End Date, Total Payable, Outstanding Balance.
    - Table 1: Repayment Schedule (Inst #, Due Date, Principal, Interest, Due Amount, Status).
    - Table 2: Collections History (Date, Amount, Agent/Staff ID, Status).
  - Return the finished PDF as a `Buffer`.

- **Step 3: Update `loans.controller.ts`**
  - Add `@Get(':id/statement')`.
  - Allowed for `org_admin`, `branch_manager`, `accountant`, `agent` (agents can view statements for their collections/customers).
  - Inject `Res()` from `@nestjs/common` and set headers:
    - `Content-Type: application/pdf`
    - `Content-Disposition: attachment; filename="loan-statement-{id}.pdf"`
  - Send the buffer.

**Execution Constraints:**
- Tables in `pdfkit` can be tedious. You can use a simple layout with tabs or column offsets, or just write lines. Keep it clean and readable.
- Handle pagination if the schedule/collections list is long (pdfkit handles page breaks if you track `doc.y`).
- Verify with `npx tsc --noEmit`.
