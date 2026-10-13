import { z } from 'zod';
import type { ResolvedUser } from '../types';

const base = { id: z.string().uuid(), organizationId: z.string().uuid(), fullName: z.string() };
const profileSchema = z.discriminatedUnion('userType', [
  z.object({ userType: z.literal('staff'), ...base, branchId: z.string().uuid().nullable(), role: z.enum(['org_admin', 'branch_manager', 'agent', 'accountant']), twoFactorEnabled: z.boolean() }),
  z.object({ userType: z.literal('customer'), ...base, activeLoanCount: z.number().int().nonnegative() }),
  z.object({ userType: z.literal('unprovisioned') }),
]);

/** HTML fallbacks and malformed responses cannot establish a workspace identity. */
export function parseAccountProfile(value: unknown, authUserId: string): ResolvedUser {
  const parsed = profileSchema.safeParse(value);
  if (!parsed.success) throw new Error('Could not verify your account. Please reconnect and retry.');
  return parsed.data.userType === 'unprovisioned' ? { ...parsed.data, authUserId } : parsed.data;
}
