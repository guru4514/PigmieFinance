import { describe, expect, it } from 'vitest';
import { parseAccountProfile } from './account-profile';
const identity = '00000000-0000-4000-8000-000000000001';
const staff = { userType: 'staff', id: identity, organizationId: identity, fullName: 'Synthetic staff', branchId: null, role: 'agent', twoFactorEnabled: false };
describe('Verified account profile shape', () => {
  it('accepts supported staff, customer and unprovisioned responses', () => {
    expect(parseAccountProfile(staff, identity)).toEqual(staff);
    expect(parseAccountProfile({ userType: 'customer', id: identity, organizationId: identity, fullName: 'Synthetic customer', activeLoanCount: 0 }, identity).userType).toBe('customer');
    expect(parseAccountProfile({ userType: 'unprovisioned' }, identity)).toEqual({ userType: 'unprovisioned', authUserId: identity });
  });
  it.each(['<html>cached app</html>', {}, { message: 'upstream unavailable' }, { ...staff, role: 'unknown' }, { ...staff, organizationId: null }])('rejects malformed bootstrap data instead of redirecting in a loop', (value) => {
    expect(() => parseAccountProfile(value, identity)).toThrow('Could not verify your account');
  });
});
