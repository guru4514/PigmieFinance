import { describe, expect, it } from 'vitest';
import { calculateEMI, type EMICalculationParams } from './emi-calculator';
import { generateSchedule } from '../../../../../pigmie-api/src/modules/loans/utils/schedule-generator.util';

const terms: EMICalculationParams = { principal: 12345.67, interestRate: 12.345, tenure: 12, tenurePeriod: 'months', collectionFrequency: 'monthly', interestType: 'flat' };
describe('Repayment estimate consistency', () => {
  it.each(['flat', 'reducing_balance'] as const)('matches the server %s calculation across collection frequencies', (interestType) => {
    for (const collectionFrequency of ['daily', 'weekly', 'biweekly', 'monthly'] as const) {
      for (const principal of [0.01, 100, 12345.67]) {
        for (const interestRate of [0, 12.345, 999.999]) {
          const input = { ...terms, interestType, collectionFrequency, principal, interestRate };
          const estimate = calculateEMI(input);
          const server = generateSchedule({ principal, annualRate: interestRate, tenure: estimate.schedule.length,
            frequency: collectionFrequency, interestType, startDate: '2026-01-31' });
          expect(estimate.schedule.map((row) => [row.principal, row.interest, row.total])).toEqual(server.map((row) => [row.principalComponent, row.interestComponent, row.dueAmount]));
          expect(estimate.schedule[estimate.schedule.length - 1]?.balance).toBe(0);
          expect(Math.round(estimate.totalPayable * 100)).toBe(server.reduce((sum, row) => sum + Math.round(row.dueAmount * 100), 0));
        }
      }
    }
  });
  it('converts durations to complete installments consistently for flat interest', () => {
    const estimate = calculateEMI({ ...terms, principal: 1000, interestRate: 12, tenure: 31, tenurePeriod: 'days', collectionFrequency: 'monthly' });
    expect(estimate.schedule).toHaveLength(2); expect(estimate.totalInterest).toBe(20);
  });
  it.each([{ principal: NaN }, { principal: Infinity }, { principal: -1 }, { principal: 1.001 }, { tenure: 0 }, { tenure: 1.5 }, { tenure: 10001 }, { interestRate: -1 }, { interestRate: Infinity }])('returns an empty estimate for invalid inputs %j', (changes) => {
    expect(calculateEMI({ ...terms, ...changes })).toEqual({ totalPayable: 0, totalInterest: 0, emi: 0, schedule: [] });
  });
});
