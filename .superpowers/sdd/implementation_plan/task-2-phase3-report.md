# Task 2: Loan Statement PDF — Backend Report

## What was implemented
- Installed `pdfkit` and `@types/pdfkit`.
- Created `pdf.service.ts` to generate professional loan statements.
- The service fetches a loan, its customer, schedule, and collection history.
- The generated PDF includes header, customer info, loan info, repayment schedule (with pagination support), and collections history (with pagination support).
- Updated `loans.module.ts` to provide and export `PdfService`.
- Updated `loans.controller.ts` to add a new `GET :id/statement` endpoint, which securely streams the generated PDF back to the user with `application/pdf` headers.

## Testing
- Verified successful compilation running `npx tsc --noEmit` inside `pigmie-api`.
- The compilation output was pristine after correctly typing the fetched objects and using `this.prisma.run` to handle Prisma queries for tenant isolation.

## Files changed
- `pigmie-api/package.json` & `package-lock.json` (installed pdfkit)
- `pigmie-api/src/modules/loans/pdf.service.ts` (created)
- `pigmie-api/src/modules/loans/loans.module.ts` (modified)
- `pigmie-api/src/modules/loans/loans.controller.ts` (modified)

## Self-review findings
- The `pdfkit` syntax is fairly manual for creating tables, so I used standard line-based formatting and tracking the `doc.y` value for pagination, which gracefully handles longer tables.
- Implemented typing properly to allow `tsc` to compile without errors.

## Issues or concerns
- None.
