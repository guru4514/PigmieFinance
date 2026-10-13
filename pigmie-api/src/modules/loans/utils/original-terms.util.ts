import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertSupportedFinancialTerms } from './financial-terms.util';

/** Original pricing is immutable; a recorded amendment may change remaining tenure. */
export function assertLoanMatchesOriginalTerms(
  loan: {
    financialTerms?: Prisma.JsonValue;
    principalAmount: Prisma.Decimal;
    interestRateAnnual: Prisma.Decimal;
    interestType: string;
    collectionFrequency: string;
    tenure: number;
  },
  beforeDisbursement = false,
): void {
  const terms = loan.financialTerms;
  assertSupportedFinancialTerms(terms);
  if (terms === null || terms === undefined) return;
  let matches = false;
  if (typeof terms === 'object' && !Array.isArray(terms)) {
    try {
      matches =
        typeof terms.originalPrincipal === 'string' &&
        typeof terms.interestRateAnnual === 'string' &&
        new Prisma.Decimal(terms.originalPrincipal).isFinite() &&
        new Prisma.Decimal(terms.originalPrincipal).equals(
          loan.principalAmount,
        ) &&
        new Prisma.Decimal(terms.interestRateAnnual).isFinite() &&
        new Prisma.Decimal(terms.interestRateAnnual).equals(
          loan.interestRateAnnual,
        ) &&
        terms.interestType === loan.interestType &&
        terms.collectionFrequency === loan.collectionFrequency &&
        typeof terms.originalTenure === 'number' &&
        Number.isSafeInteger(terms.originalTenure) &&
        terms.originalTenure > 0 &&
        (!beforeDisbursement || terms.originalTenure === loan.tenure);
    } catch {
      // Malformed immutable evidence must never be interpreted with current product terms.
    }
  }
  if (!matches)
    throw new BadRequestException(
      'Loan pricing differs from its original financial contract; reconciliation is required',
    );
}
