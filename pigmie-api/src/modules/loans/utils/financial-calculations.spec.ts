import { Prisma } from '@prisma/client';
import {
  generateSchedule,
  GenerateScheduleParams,
} from './schedule-generator.util';
import { addPeriods, businessDate } from './date.util';
import { calculatePreClosure } from './pre-closure.util';

const terms: GenerateScheduleParams = {
  principal: 100,
  annualRate: 12,
  tenure: 200,
  interestType: 'flat',
  frequency: 'daily',
  startDate: '2026-01-31',
};
const cents = (amount: number) => Math.round(amount * 100);
describe('Repayment calculations', () => {
  it.each(['daily', 'weekly', 'biweekly', 'monthly'] as const)(
    'conserves principal and nonnegative cents for %s schedules',
    (frequency) => {
      for (const interestType of ['flat', 'reducing_balance'] as const) {
        for (const principal of [0.01, 1.01, 100, 12345.67]) {
          for (const tenure of [1, 3, 12, 200]) {
            const rows = generateSchedule({
              ...terms,
              principal,
              tenure,
              frequency,
              interestType,
            });
            expect(rows).toHaveLength(tenure);
            expect(
              rows.reduce((sum, row) => sum + cents(row.principalComponent), 0),
            ).toBe(cents(principal));
            for (const row of rows) {
              expect(row.principalComponent).toBeGreaterThanOrEqual(0);
              expect(row.interestComponent).toBeGreaterThanOrEqual(0);
              expect(cents(row.dueAmount)).toBe(
                cents(row.principalComponent) + cents(row.interestComponent),
              );
            }
          }
        }
      }
    },
  );
  it('supports zero interest and fractional currency without a negative last installment', () => {
    for (const interestType of ['flat', 'reducing_balance'] as const) {
      const rows = generateSchedule({
        ...terms,
        principal: 100.01,
        annualRate: 0,
        interestType,
      });
      expect(rows.reduce((sum, row) => sum + cents(row.dueAmount), 0)).toBe(
        10001,
      );
      expect(
        rows.every(
          (row) => row.interestComponent === 0 && row.principalComponent >= 0,
        ),
      ).toBe(true);
    }
  });
  it.each([
    { principal: NaN },
    { principal: Infinity },
    { principal: -1 },
    { principal: 1.001 },
    { tenure: 0 },
    { tenure: 1.5 },
    { tenure: 10001 },
    { annualRate: -1 },
    { annualRate: Infinity },
    { startDate: '2026-02-30' },
    { startDate: '2026-01-01T00:00:00Z' },
  ])('rejects invalid terms %j', (change) => {
    expect(() => generateSchedule({ ...terms, ...change })).toThrow();
  });
  it('rejects unsupported runtime enums', () => {
    expect(() =>
      generateSchedule({ ...terms, frequency: 'yearly' as never }),
    ).toThrow();
    expect(() =>
      generateSchedule({ ...terms, interestType: 'unknown' as never }),
    ).toThrow();
  });
  it('caps a month at its final day and restores the original day in later months', () => {
    expect(
      [1, 2, 3].map((n) => addPeriods('2026-01-31', n, 'monthly')),
    ).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(addPeriods('2024-01-31', 1, 'monthly')).toBe('2024-02-29');
    expect(addPeriods('2026-12-31', 2, 'monthly')).toBe('2027-02-28');
  });
  it('handles daily and weekly dates across years independently of server timezone', () => {
    expect(addPeriods('2026-12-31', 1, 'daily')).toBe('2027-01-01');
    expect(addPeriods('2026-12-31', 1, 'weekly')).toBe('2027-01-07');
    expect(addPeriods('2026-12-31', 1, 'biweekly')).toBe('2027-01-14');
    expect(businessDate(new Date('2026-01-01T18:29:59Z')).toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(businessDate(new Date('2026-01-01T18:30:00Z')).toISOString()).toBe(
      '2026-01-02T00:00:00.000Z',
    );
  });
});

const decimal = (n: number) => new Prisma.Decimal(n);
const row = (
  changes: Partial<Parameters<typeof calculatePreClosure>[0][number]> = {},
) => ({
  installmentNumber: 1,
  dueDate: new Date('2026-01-31'),
  principalComponent: decimal(100),
  interestComponent: decimal(10),
  dueAmount: decimal(110),
  paidAmount: decimal(0),
  status: 'pending' as const,
  ...changes,
});
describe('Early closure', () => {
  const start = new Date('2026-01-01');
  const now = new Date('2026-01-31T10:00:00Z');
  it('includes partially paid installments and subtracts the actual paid balance proportionally', () => {
    expect(
      calculatePreClosure(
        [row({ paidAmount: decimal(55), status: 'partially_paid' })],
        start,
        now,
      ),
    ).toEqual({
      outstandingPrincipal: 50,
      accruedInterest: 5,
      lateFees: 0,
      preClosurePenalty: 0,
      penaltyRate: 0,
      preClosureAmount: 55,
      amountSaved: 0,
    });
  });
  it('preserves remaining fees and applies no invented penalty', () => {
    const result = calculatePreClosure(
      [
        row({
          dueAmount: decimal(120),
          paidAmount: decimal(60),
          status: 'overdue',
        }),
      ],
      start,
      now,
    );
    expect(result).toMatchObject({
      outstandingPrincipal: 50,
      accruedInterest: 5,
      lateFees: 5,
      preClosureAmount: 60,
      penaltyRate: 0,
    });
  });
  it('accrues only the current calendar period and waives future interest', () => {
    const result = calculatePreClosure(
      [
        row({ interestComponent: decimal(30), dueAmount: decimal(130) }),
        row({ installmentNumber: 2, dueDate: new Date('2026-02-28') }),
      ],
      start,
      new Date('2026-01-16T10:00:00Z'),
    );
    expect(result).toMatchObject({
      outstandingPrincipal: 200,
      accruedInterest: 15,
      preClosureAmount: 215,
      amountSaved: 25,
    });
  });
  it('does not charge interest before disbursement, nor include paid or waived rows', () => {
    expect(
      calculatePreClosure([row()], start, new Date('2025-12-31')),
    ).toMatchObject({ accruedInterest: 0, preClosureAmount: 100 });
    expect(
      calculatePreClosure(
        [
          row({ status: 'paid' }),
          row({ installmentNumber: 2, status: 'waived' }),
        ],
        start,
        now,
      ).preClosureAmount,
    ).toBe(0);
  });
  it('fails closed on negative historical components or excess payments', () => {
    expect(() =>
      calculatePreClosure(
        [row({ principalComponent: decimal(-1) })],
        start,
        now,
      ),
    ).toThrow('reconciliation');
    expect(() =>
      calculatePreClosure([row({ paidAmount: decimal(111) })], start, now),
    ).toThrow('reconciliation');
    expect(() => calculatePreClosure([row()], null, now)).toThrow();
    expect(() => calculatePreClosure([], start, now)).toThrow();
  });
});
