# Task 1: Loan Restructuring — Backend

**Files:**
- Create: `pigmie-api/src/modules/loans/dto/restructure-loan.dto.ts`
- Modify: `pigmie-api/src/modules/loans/loans.service.ts` (add `restructure()`)
- Modify: `pigmie-api/src/modules/loans/loans.controller.ts` (add `POST /:id/restructure`)

**Interfaces:**
- Consumes: `TenantPrismaService`, `generateSchedule()` from `utils/schedule-generator.util.ts`, `LoanSchedule` and `Loan` Prisma models
- Produces: `POST /api/v1/loans/:id/restructure` — recalculates remaining principal, deletes unpaid schedule tail, generates new rows, updates loan totals

**Implementation Details:**
- **Step 1: Create `restructure-loan.dto.ts`**
  ```typescript
  import { IsInt, IsString, Min, IsOptional } from 'class-validator';

  export class RestructureLoanDto {
    @IsInt()
    @Min(1)
    fromInstallmentNumber: number;

    @IsInt()
    @Min(1)
    newTenure: number;

    @IsOptional()
    @IsString()
    reason?: string;
  }
  ```

- **Step 2: Add `restructure()` to `loans.service.ts`**
  - Verify the loan exists and belongs to the org.
  - Delete all schedule rows where `installmentNumber >= dto.fromInstallmentNumber` and `status === 'pending'`.
  - Calculate remaining principal (sum of `principalComponent` from deleted rows, plus any outstanding late fees).
  - Call `generateSchedule(remainingPrincipal, loan.interestRate, dto.newTenure, loan.paymentFrequency, newStartDate)`. Note: You must ensure `generateSchedule` creates rows starting at `fromInstallmentNumber` instead of 1, or offset them before inserting.
  - Insert the new schedule rows.
  - Update the `Loan` record: `tenure` (becomes `fromInstallmentNumber - 1 + newTenure`), `totalPayable`, `expectedEndDate`.
  - Must be wrapped in `this.tenantPrisma.run(orgId, async (tx) => { ... })`.
  - Create an audit log: `action: 'loan.restructured'`.

- **Step 3: Update `loans.controller.ts`**
  - Add `@Post(':id/restructure')`
  - Add `@Roles('org_admin', 'branch_manager')`
  - Add `@AuditAction('loan.restructured')`

**Execution Constraints:**
- The transaction logic is complex. Double-check the math for remaining principal.
- Do NOT delete schedule rows that are already `paid` or `partial`. If `fromInstallmentNumber` points to a paid row, throw a `BadRequestException`.
- Verify with `npx tsc --noEmit`.
