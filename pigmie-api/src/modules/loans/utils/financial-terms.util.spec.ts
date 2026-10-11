import { Prisma } from '@prisma/client';
import {
  assertSupportedFinancialTerms,
  assertScheduleMatchesFinancialTerms,
} from './financial-terms.util';
const contract = {
  version: 1,
  currency: 'INR',
  businessTimezone: 'Asia/Kolkata',
  paymentAllocation: 'oldest_installment_proportional_components_v1',
  earlyClosure: 'unpaid_principal_daily_accrued_interest_v1',
  rounding: 'INR_two_decimal_half_up',
  lateFee: '0.00',
  processingFee: '0.00',
  preClosurePenalty: '0.00',
};
describe('Versioned financial policy admission', () => {
  it('rejects schedule fees added to an otherwise supported zero-fee contract', () => {
    const row = {
      principalComponent: new Prisma.Decimal(100),
      interestComponent: new Prisma.Decimal(1),
      dueAmount: new Prisma.Decimal(102),
    };
    expect(() => assertScheduleMatchesFinancialTerms(contract, [row])).toThrow(
      'saved zero-fee contract',
    );
    expect(() =>
      assertScheduleMatchesFinancialTerms(contract, [
        { ...row, dueAmount: new Prisma.Decimal(101) },
      ]),
    ).not.toThrow();
    expect(() =>
      assertScheduleMatchesFinancialTerms(null, [row]),
    ).not.toThrow();
  });
  it('accepts supported zero-fee contracts', () =>
    expect(() => assertSupportedFinancialTerms(contract)).not.toThrow());
  it('preserves explicitly unknown historical terms', () =>
    expect(() => assertSupportedFinancialTerms(null)).not.toThrow());
  it.each([
    { version: 2 },
    { paymentAllocation: 'newest_first' },
    { earlyClosure: 'fixed_penalty' },
    { lateFee: '2.00' },
    { processingFee: '1.00' },
  ])('rejects unsupported policy %j', (change) =>
    expect(() =>
      assertSupportedFinancialTerms({ ...contract, ...change }),
    ).toThrow('contract requires reconciliation'),
  );
});
