import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { processSyncQueue } from '@/shared/lib/offline-sync';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { Toaster } from '@/shared/components/ui/sonner';
import { ProtectedRoute } from '@/shared/components/auth/protected-route';
import { AppLayout } from '@/shared/components/layout/app-layout';
import { PortalLayout } from '@/shared/components/layout/portal-layout';
import { LoginPage } from '@/features/auth/pages/login-page';
import { SignupPage } from '@/features/auth/pages/signup-page';
import { Setup2FAPage } from '@/features/auth/pages/setup-2fa-page';
import { Verify2FAPage } from '@/features/auth/pages/verify-2fa-page';
import { DashboardPage } from '@/features/dashboard/pages/dashboard-page';

import { CustomersListPage } from '@/features/customers/pages/customers-list-page';
import { CustomerDetailPage } from '@/features/customers/pages/customer-detail-page';
import { CustomerFormPage } from '@/features/customers/pages/customer-form-page';
import { ImportCustomersPage } from '@/features/customers/pages/import-customers-page';
import { LoansListPage } from '@/features/loans/pages/loans-list-page';
import { LoanDetailPage } from '@/features/loans/pages/loan-detail-page';
import { NewLoanPage } from '@/features/loans/pages/new-loan-page';
import { EMICalculatorPage } from '@/features/loans/pages/emi-calculator-page';
import { CollectionsTodayPage } from '@/features/collections/pages/collections-today-page';
import { RecordCollectionPage } from '@/features/collections/pages/record-collection-page';
import { LoanProductsPage } from '@/features/loan-products/pages/loan-products-page';
import { NewLoanProductPage } from '@/features/loan-products/pages/new-loan-product-page';
import { StaffPage } from '@/features/staff/pages/staff-page';
import { StaffFormPage } from '@/features/staff/pages/staff-form-page';
import { AuditLogsPage } from '@/features/audit-logs/pages/audit-logs-page';
import { ReportsPage } from '@/features/reports/pages/reports-page';
import { SettingsPage } from '@/features/settings/pages/settings-page';
import { ApprovalsPage } from '@/features/approvals/pages/approvals-page';
import { PortalDashboardPage } from '@/features/portal/pages/portal-dashboard-page';
import { PortalLoanDetailPage } from '@/features/portal/pages/portal-loan-detail-page';
import { BranchesPage } from '@/features/branches/pages/branches-page';
import { CashDepositsPage } from '@/features/cash-deposits/pages/cash-deposits-page';
import { BranchComparisonPage } from '@/features/reports/pages/branch-comparison-page';

export function App() {
  useEffect(() => {
    const handleOnline = () => {
      processSyncQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <>
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<SignupPage />} />
      <Route path="/setup-2fa" element={<Setup2FAPage />} />
      <Route path="/verify-2fa" element={<Verify2FAPage />} />
      
      {/* Staff Routes */}
      <Route path="/app" element={
        <ProtectedRoute>
          <ErrorBoundary>
            <AppLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="customers" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><CustomersListPage /></ProtectedRoute>} />
        <Route path="customers/new" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent']}><CustomerFormPage /></ProtectedRoute>} />
        <Route path="customers/import" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent']}><ImportCustomersPage /></ProtectedRoute>} />
        <Route path="customers/:id" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><CustomerDetailPage /></ProtectedRoute>} />
        <Route path="customers/:id/edit" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent']}><CustomerFormPage /></ProtectedRoute>} />
        <Route path="loans" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><LoansListPage /></ProtectedRoute>} />
        <Route path="loans/new" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent']}><NewLoanPage /></ProtectedRoute>} />
        <Route path="emi-calculator" element={<EMICalculatorPage />} />
        <Route path="loans/:id" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><LoanDetailPage /></ProtectedRoute>} />
        <Route path="collections/today" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><CollectionsTodayPage /></ProtectedRoute>} />
        <Route path="collections/record/:loanId" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent']}><RecordCollectionPage /></ProtectedRoute>} />
        <Route path="loan-products/new" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><NewLoanProductPage /></ProtectedRoute>} />
        <Route path="loan-products" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><LoanProductsPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'accountant']}><ReportsPage /></ProtectedRoute>} />
        <Route path="reports/branch-comparison" element={<ProtectedRoute allowedRoles={['org_admin']}><BranchComparisonPage /></ProtectedRoute>} />
        <Route path="approvals" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><ApprovalsPage /></ProtectedRoute>} />
        <Route path="staff" element={<ProtectedRoute allowedRoles={['org_admin']}><StaffPage /></ProtectedRoute>} />
        <Route path="staff/new" element={<ProtectedRoute allowedRoles={['org_admin']}><StaffFormPage /></ProtectedRoute>} />
        <Route path="audit-logs" element={<ProtectedRoute allowedRoles={['org_admin', 'accountant']}><AuditLogsPage /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute allowedRoles={['org_admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="branches" element={<ProtectedRoute allowedRoles={['org_admin']}><BranchesPage /></ProtectedRoute>} />
        <Route path="cash-deposits" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><CashDepositsPage /></ProtectedRoute>} />
      </Route>
      
      {/* Portal Routes */}
      <Route path="/portal" element={
        <ProtectedRoute>
          <ErrorBoundary>
            <PortalLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PortalDashboardPage />} />
        <Route path="loans/:id" element={<PortalLoanDetailPage />} />
      </Route>
    </Routes>
    <Toaster />
    </>
  );
}
