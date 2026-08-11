export type StaffRole = 'org_admin' | 'branch_manager' | 'agent' | 'accountant';

export type StaffUser = { type: 'staff'; id: string; organizationId: string; role: StaffRole };
export type CustomerUser = { type: 'customer'; id: string; organizationId: string };
export type UnprovisionedUser = { type: 'unprovisioned'; authUserId: string };

export type RequestUser = StaffUser | CustomerUser | UnprovisionedUser;

/** Use in controllers that require @Roles() — guaranteed to have organizationId and id */
export type AuthenticatedUser = StaffUser | CustomerUser;
