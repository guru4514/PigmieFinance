# Task 3: Branch Manager Scoped Views (Issue #4)

**Goal:** Ensure branch managers only see data tied to their specific `branchId`.

**Context:** The API currently allows `branch_manager` users to see org-wide data in several modules. We need to add scope filters for `branchId` to all relevant queries where the user is a `branch_manager`.

**Requirements:**
1. **CustomersService** (`pigmie-api/src/modules/customers/customers.service.ts`):
   - In `findAll()`, if `user.role === 'branch_manager' && user.branchId`, add `{ branchId: user.branchId }` to the `where` clause.
2. **LoansService** (`pigmie-api/src/modules/loans/loans.service.ts`):
   - In `findAll()`, if `user.role === 'branch_manager' && user.branchId`, add `{ customer: { branchId: user.branchId } }` to the `where` clause.
3. **CollectionsService** (`pigmie-api/src/modules/collections/collections.service.ts`):
   - In `findAll()`, if `user.role === 'branch_manager' && user.branchId`, add `{ customer: { branchId: user.branchId } }` to the `where` clause.
   - In `getDueToday()`, add a similar filter for the customer's branch. Note: `getDueToday` might be using `prisma.loanSchedule.findMany`, so filter by `{ loan: { customer: { branchId: user.branchId } } }`.
4. **ReportsService** (`pigmie-api/src/modules/reports/reports.service.ts`):
   - In `getDashboardSummary()`, `getOverdue()`, `getPortfolioAtRisk()`, `getCollectionEfficiency()`, and `getAgentPerformance()`.
   - The reports use raw SQL queries. You must append an `AND c."branch_id" = ${user.branchId}` to the `WHERE` clauses if the user is a `branch_manager` and has a `branchId`. (Be careful with raw SQL interpolation, use parameterized query features like Prisma's `$queryRaw` tagged templates correctly).

**Execution Constraints:**
- Must compile without TypeScript errors (`npx tsc --noEmit`).
- Ensure no data leaks across branches for branch managers.
