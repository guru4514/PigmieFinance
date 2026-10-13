import { Prisma } from '@prisma/client';
import { assertLoanMatchesOriginalTerms } from './original-terms.util';
const terms = {
  version: 1,
  currency: 'INR',
  businessTimezone: 'Asia/Kolkata',
  paymentAllocation: 'oldest_installment_proportional_components_v1',
  earlyClosure: 'unpaid_principal_daily_accrued_interest_v1',
  rounding: 'INR_two_decimal_half_up',
  lateFee: '0.00',
  processingFee: '0.00',
  preClosurePenalty: '0.00',
  originalPrincipal: '100.00',
  originalTenure: 2,
  interestRateAnnual: '12',
  interestType: 'flat',
  collectionFrequency: 'monthly',
};
const loan = {
  financialTerms: terms,
  principalAmount: new Prisma.Decimal(100),
  interestRateAnnual: new Prisma.Decimal(12),
  interestType: 'flat',
  collectionFrequency: 'monthly',
  tenure: 2,
};
describe('Original contract pricing admission', () => {
  it('accepts exact saved pricing', () =>
    expect(() => assertLoanMatchesOriginalTerms(loan, true)).not.toThrow());
  it('retains historical unknown terms', () =>
    expect(() =>
      assertLoanMatchesOriginalTerms({ ...loan, financialTerms: null }, true),
    ).not.toThrow());
  it.each([
    { originalPrincipal: '101.00' },
    { interestRateAnnual: '15' },
    { interestType: 'reducing' },
    { collectionFrequency: 'daily' },
    { originalPrincipal: 'invalid' },
    { originalTenure: 0 },
  ])('rejects changed or invalid saved pricing %j', (change) =>
    expect(() =>
      assertLoanMatchesOriginalTerms({
        ...loan,
        financialTerms: { ...terms, ...change },
      }),
    ).toThrow('original financial contract'),
  );
  it('requires original tenure before disbursement while preserving amendment tenure afterwards', () => {
    expect(() =>
      assertLoanMatchesOriginalTerms({ ...loan, tenure: 3 }, true),
    ).toThrow('original financial contract');
    expect(() =>
      assertLoanMatchesOriginalTerms({ ...loan, tenure: 3 }),
    ).not.toThrow();
  });
});
