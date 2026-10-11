import { z } from 'zod';

export const portfolioRiskSchema = z.object({
  par_1: z.number().min(0).max(1), par_30: z.number().min(0).max(1), par_90: z.number().min(0).max(1),
});
export const collectionEfficiencySchema = z.object({ data: z.array(z.object({
  staff_id: z.string(), agent_name: z.string(), total_due: z.number(), total_collected: z.number(), efficiency_percent: z.number(),
}).transform((row) => ({ agentId: row.staff_id, agentName: row.agent_name, expected: row.total_due, actual: row.total_collected, efficiency: row.efficiency_percent }))) });
export const agentPerformanceSchema = z.object({ data: z.array(z.object({
  staff_id: z.string(), agent_name: z.string(), collections_made: z.number().int().nonnegative(), total_collected: z.number(), customers_assigned: z.number().int().nonnegative(),
}).transform((row) => ({ agentId: row.staff_id, agentName: row.agent_name, totalCollections: row.collections_made, amountCollected: row.total_collected, customersAssigned: row.customers_assigned }))) });
