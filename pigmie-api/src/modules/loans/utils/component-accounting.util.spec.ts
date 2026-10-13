import { Prisma } from '@prisma/client';
import {
  allocateComponents,
  paidComponents,
} from './component-accounting.util';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const row = (principal: number, interest: number, fees = 0) => ({
  principalComponent: decimal(principal),
  interestComponent: decimal(interest),
  dueAmount: decimal(principal).plus(interest).plus(fees),
  paidAmount: decimal(0),
  paidPrincipal: decimal(0),
  paidInterest: decimal(0),
  paidFees: decimal(0),
});

describe('Exact principal, interest and fee allocation', () => {
  it('preserves paise across rounding, multiple payments and full repayment', () => {
    const current = row(0.03, 0.02, 0.01);
    for (let i = 0; i < 6; i++) {
      const split = allocateComponents(current, decimal('0.01'));
      expect(
        split.principal.plus(split.interest).plus(split.fees).toFixed(2),
      ).toBe('0.01');
      current.paidAmount = current.paidAmount.plus('0.01');
      current.paidPrincipal = current.paidPrincipal.plus(split.principal);
      current.paidInterest = current.paidInterest.plus(split.interest);
      current.paidFees = current.paidFees.plus(split.fees);
      expect(() => paidComponents(current)).not.toThrow();
    }
    expect(current.paidPrincipal.toFixed(2)).toBe('0.03');
    expect(current.paidInterest.toFixed(2)).toBe('0.02');
    expect(current.paidFees.toFixed(2)).toBe('0.01');
  });
  it('subtracts a saved earlier allocation without changing the later components', () => {
    const current = row(100, 10, 5);
    const earlier = allocateComponents(current, decimal(40));
    current.paidAmount = decimal(40);
    current.paidPrincipal = earlier.principal;
    current.paidInterest = earlier.interest;
    current.paidFees = earlier.fees;
    const later = allocateComponents(current, decimal(30));
    current.paidAmount = current.paidAmount.plus(30);
    current.paidPrincipal = current.paidPrincipal.plus(later.principal);
    current.paidInterest = current.paidInterest.plus(later.interest);
    current.paidFees = current.paidFees.plus(later.fees);
    expect(() => paidComponents(current)).not.toThrow();
    current.paidAmount = current.paidAmount.minus(40);
    current.paidPrincipal = current.paidPrincipal.minus(earlier.principal);
    current.paidInterest = current.paidInterest.minus(earlier.interest);
    current.paidFees = current.paidFees.minus(earlier.fees);
    expect(paidComponents(current)).toEqual(later);
  });
  it('does not manufacture historical partial-paid component values', () => {
    const current = {
      ...row(100, 10),
      paidAmount: decimal(20),
      paidPrincipal: null,
      paidInterest: null,
      paidFees: null,
    };
    expect(() => allocateComponents(current, decimal(10))).toThrow(
      'source reconciliation',
    );
    expect(
      paidComponents({ ...current, paidAmount: decimal(0) }).principal.isZero(),
    ).toBe(true);
  });
  it('rejects incomplete, inconsistent, negative or excessive components', () => {
    const current = row(100, 10);
    expect(() => paidComponents({ ...current, paidPrincipal: null })).toThrow();
    expect(() =>
      paidComponents({ ...current, paidPrincipal: decimal(1) }),
    ).toThrow();
    expect(() =>
      paidComponents({ ...current, paidPrincipal: decimal(-1) }),
    ).toThrow();
    expect(() => allocateComponents(current, decimal(111))).toThrow();
    expect(() => allocateComponents(current, decimal('0.001'))).toThrow();
    expect(() => allocateComponents(current, decimal('NaN'))).toThrow();
    expect(() =>
      paidComponents({ ...current, principalComponent: decimal('NaN') }),
    ).toThrow();
    expect(() =>
      paidComponents({ ...current, paidFees: decimal('Infinity') }),
    ).toThrow();
  });
});
