import { describe, expect, it } from 'vitest';
import { agentPerformanceSchema, collectionEfficiencySchema, portfolioRiskSchema } from './report-contracts';

describe('Actual report response contracts', () => {
  it('retains portfolio ratios for percentage display instead of returning an empty loan list', () => {
    expect(portfolioRiskSchema.parse({ par_1: 0.25, par_30: 0.1, par_90: 0 })).toEqual({ par_1: 0.25, par_30: 0.1, par_90: 0 });
  });
  it('maps scheduled agent totals without losing nonzero amounts or cents', () => {
    expect(collectionEfficiencySchema.parse({ data: [{ staff_id: 'agent', agent_name: 'Synthetic', total_due: 100.5, total_collected: 75.25, efficiency_percent: 74.88 }] }).data[0]).toEqual({ agentId: 'agent', agentName: 'Synthetic', expected: 100.5, actual: 75.25, efficiency: 74.88 });
  });
  it('maps agent performance counts and amounts from the SQL response', () => {
    expect(agentPerformanceSchema.parse({ data: [{ staff_id: 'agent', agent_name: 'Synthetic', collections_made: 3, total_collected: 200.25, customers_assigned: 2 }] }).data[0]).toEqual({ agentId: 'agent', agentName: 'Synthetic', totalCollections: 3, amountCollected: 200.25, customersAssigned: 2 });
  });
  it('treats malformed/missing report fields as errors rather than fabricated zeros', () => {
    expect(() => portfolioRiskSchema.parse([])).toThrow();
    expect(() => collectionEfficiencySchema.parse({ data: [{ date: '2026-01-01', expected: 100 }] })).toThrow();
    expect(() => agentPerformanceSchema.parse({})).toThrow();
  });
});
