export type StaffRole = 'org_admin' | 'branch_manager' | 'agent' | 'accountant';

export interface BaseUser {
  id: string;
  organizationId: string;
  fullName: string;
}

export interface StaffUser extends BaseUser {
  userType: 'staff';
  branchId: string | null;
  role: StaffRole;
  twoFactorEnabled: boolean;
}

export interface CustomerUser extends BaseUser {
  userType: 'customer';
  activeLoanCount: number;
}

export interface UnprovisionedUser {
  userType: 'unprovisioned';
  authUserId: string;
}

export type ResolvedUser = StaffUser | CustomerUser | UnprovisionedUser;

export interface Organization {
  id: string;
  organizationName: string;
  operatorType: string;
  currency: string;
  timezone: string;
  contactPhone: string;
  contactEmail?: string;
  address?: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  idProofType: string;
  dateOfBirth: string;
  guarantorName?: string;
  guarantorPhone?: string;
  branchId: string;
  assignedAgentId: string | null;
  isActive: boolean;
  portalAccessEnabled: boolean;
}

export interface LoanProduct {
  id: string;
  name: string;
  interestType: 'flat' | 'reducing_balance';
  interestRateAnnual: number;
  collectionFrequency: 'daily' | 'weekly' | 'monthly';
  minAmount: number;
  maxAmount: number;
  minTenure: number;
  maxTenure: number;
  lateFeeType: 'flat' | 'percentage';
  lateFeeValue: number;
  processingFee: number;
}

export type LoanStatus = 'pending_approval' | 'approved' | 'active' | 'closed' | 'defaulted' | 'written_off' | 'rejected';

export interface Loan {
  id: string;
  customerId: string;
  loanProductId: string;
  principalAmount: number;
  tenure: number;
  assignedAgentId: string;
  status: LoanStatus;
  approvedBy?: string;
  approvedAt?: string;
  disbursedBy?: string;
  disbursedAt?: string;
  startDate?: string;
  expectedEndDate?: string;
  installmentAmount?: number;
  totalPayable?: number;
  outstandingBalance?: number;
}

export interface LoanSchedule {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  dueAmount: number;
  principalComponent: number;
  interestComponent: number;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  paidAmount: number;
}

export interface Collection {
  id: string;
  clientGeneratedId: string;
  loanId: string;
  amount: number;
  collectionDate: string;
  collectedAt: string;
  collectionMethod: 'cash' | 'cheque' | 'other';
  latitude?: number;
  longitude?: number;
  photoPath?: string;
  status: 'recorded' | 'verified' | 'reversed';
  receiptNumber?: string;
}

export interface PendingCollection {
  clientGeneratedId: string;
  loanId: string;
  amount: number;
  collectionDate: string;
  collectedAt: string;
  collectionMethod: 'cash' | 'cheque' | 'other';
  latitude?: number;
  longitude?: number;
  photoPath?: string;
  queuedAt?: number;
}

export interface ReportSummary {
  activeLoans: number;
  totalOutstanding: number;
  collectedToday: number;
  dueToday: number;
  overdueCount: number;
  portfolioAtRisk30: number;
}
