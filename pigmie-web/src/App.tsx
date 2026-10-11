import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { processSyncQueue, getPendingCount, getCollectionOwner } from '@/shared/lib/offline-queue';
import { useAuth } from '@/shared/hooks/use-auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { Toaster } from '@/shared/components/ui/sonner';
import { ProtectedRoute } from '@/shared/components/auth/protected-route';
import { AppLayout } from '@/shared/components/layout/app-layout';
import { PortalLayout } from '@/shared/components/layout/portal-layout';
import { LoginPage } from '@/features/auth/pages/login-page';
import { UpdatePasswordPage } from '@/features/auth/pages/update-password-page';
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
import { CollectionHistoryPage } from '@/features/collections/pages/collection-history-page';
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
import { clearPreviousAccountQueries } from '@/shared/lib/session-cache';
import { LoadingScreen } from '@/shared/components/ui/loading-spinner';

export function App() {
  const { session, user, isMfaVerified } = useAuth();
  const queryClient = useQueryClient();
  const authUserId = session?.user.id ?? null;
  const [cacheOwner, setCacheOwner] = useState<string | null>(null);
  useLayoutEffect(() => {
    let current = true;
    void clearPreviousAccountQueries(queryClient, authUserId, () => current).then((cleared) => {
      if (cleared && current) setCacheOwner(authUserId);
    });
    return () => { current = false; };
  }, [authUserId, queryClient]);
  const owner = useMemo(() => getCollectionOwner(session?.user.id, user), [session?.user.id, user]);
  useEffect(() => {
    if (!owner || !isMfaVerified) return;
    let active = true;
    const handleOnline = async () => {
      if (!navigator.onLine) return;
      try {
        const count = await getPendingCount(owner);
        if (count > 0) {
          const result = await processSyncQueue(owner);
          if (active && result.synced > 0) {
            await queryClient.invalidateQueries({ queryKey: ['collections'] });
            await queryClient.invalidateQueries({ queryKey: ['loans'] });
            await queryClient.invalidateQueries({ queryKey: ['reports'] });
            toast.success(`Synced ${result.synced} saved collection(s)`);
          }
        }
      } catch (error: unknown) {
        if (active) toast.error(error instanceof Error ? error.message : 'Could not sync saved collections. They remain on this device.');
      }
    };
    void handleOnline();
    window.addEventListener('online', handleOnline);
    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
    };
  }, [owner, queryClient, isMfaVerified]);

  if (cacheOwner !== authUserId) return <LoadingScreen />;
  return (
    <>
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<SignupPage />} />
      <Route path="/setup-2fa" element={<Setup2FAPage />} />
      <Route path="/verify-2fa" element={<Verify2FAPage />} />
      
      {/* Staff Routes */}
      <Route path="/app" element={
        <ProtectedRoute requiredUserType="staff">
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
        <Route path="emi-calculator" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><EMICalculatorPage /></ProtectedRoute>} />
        <Route path="loans/:id" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><LoanDetailPage /></ProtectedRoute>} />
        <Route path="collections/today" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><CollectionsTodayPage /></ProtectedRoute>} />
        <Route path="collections/history" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><CollectionHistoryPage /></ProtectedRoute>} />
        <Route path="collections/record/:loanId" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent']}><RecordCollectionPage /></ProtectedRoute>} />
        <Route path="loan-products/new" element={<ProtectedRoute allowedRoles={['org_admin']}><NewLoanProductPage /></ProtectedRoute>} />
        <Route path="loan-products" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><LoanProductsPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'accountant']}><ReportsPage /></ProtectedRoute>} />
        <Route path="reports/branch-comparison" element={<ProtectedRoute allowedRoles={['org_admin']}><BranchComparisonPage /></ProtectedRoute>} />
        <Route path="approvals" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><ApprovalsPage /></ProtectedRoute>} />
        <Route path="staff" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><StaffPage /></ProtectedRoute>} />
        <Route path="staff/new" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><StaffFormPage /></ProtectedRoute>} />
        <Route path="audit-logs" element={<ProtectedRoute allowedRoles={['org_admin']}><AuditLogsPage /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute allowedRoles={['org_admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="branches" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><BranchesPage /></ProtectedRoute>} />
        <Route path="cash-deposits" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager', 'agent', 'accountant']}><CashDepositsPage /></ProtectedRoute>} />
      </Route>
      
      {/* Portal Routes */}
      <Route path="/portal" element={
        <ProtectedRoute requiredUserType="customer">
          <ErrorBoundary>
            <PortalLayout />
          </ErrorBoundary>
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PortalDashboardPage />} />
        <Route path="loans/:id" element={<PortalLoanDetailPage />} />
      </Route>
      <Route path="*" element={
          <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
            <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
            <p className="text-xl text-muted-foreground mt-4">Page not found</p>
            <Link to="/app/dashboard" className="mt-6 text-primary hover:underline">Go to Dashboard</Link>
          </div>
        } />
      </Routes>
    <Toaster />
    </>
  );
}
