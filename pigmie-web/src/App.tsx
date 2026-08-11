import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { processSyncQueue } from './lib/offline-sync';
import { Toaster } from './shared/components/ui/sonner';
import { ProtectedRoute } from './shared/components/auth/protected-route';
import { AppLayout } from './shared/components/layout/app-layout';
import { PortalLayout } from './shared/components/layout/portal-layout';
import { LoginPage } from './features/auth/pages/login-page';
import { SignupPage } from './features/auth/pages/signup-page';
import { Setup2FAPage } from './features/auth/pages/setup-2fa-page';
import { Verify2FAPage } from './features/auth/pages/verify-2fa-page';
import { DashboardPage } from './features/dashboard/pages/dashboard-page';

import { CustomersListPage } from './features/customers/pages/customers-list-page';
import { CustomerDetailPage } from './features/customers/pages/customer-detail-page';
import { CustomerFormPage } from './features/customers/pages/customer-form-page';
import { ImportCustomersPage } from './features/customers/pages/import-customers-page';
import { LoansListPage } from './features/loans/pages/loans-list-page';
import { LoanDetailPage } from './features/loans/pages/loan-detail-page';
import { NewLoanPage } from './features/loans/pages/new-loan-page';
import { CollectionsTodayPage } from './features/collections/pages/collections-today-page';
import { RecordCollectionPage } from './features/collections/pages/record-collection-page';
import { LoanProductsPage } from './features/loan-products/pages/loan-products-page';
import { NewLoanProductPage } from './features/loan-products/pages/new-loan-product-page';
import { StaffPage } from './features/staff/pages/staff-page';
import { StaffFormPage } from './features/staff/pages/staff-form-page';
import { ReportsPage } from './features/reports/pages/reports-page';
import { SettingsPage } from './features/settings/pages/settings-page';
import { PortalDashboardPage } from './features/portal/pages/portal-dashboard-page';
import { PortalLoanDetailPage } from './features/portal/pages/portal-loan-detail-page';

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
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="customers" element={<CustomersListPage />} />
        <Route path="customers/new" element={<CustomerFormPage />} />
        <Route path="customers/import" element={<ImportCustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="customers/:id/edit" element={<CustomerFormPage />} />
        <Route path="loans" element={<LoansListPage />} />
        <Route path="loans/new" element={<NewLoanPage />} />
        <Route path="loans/:id" element={<LoanDetailPage />} />
        <Route path="collections/today" element={<CollectionsTodayPage />} />
        <Route path="collections/record/:loanId" element={<RecordCollectionPage />} />
        <Route path="loan-products/new" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><NewLoanProductPage /></ProtectedRoute>} />
        <Route path="loan-products" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><LoanProductsPage /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute allowedRoles={['org_admin', 'branch_manager']}><ReportsPage /></ProtectedRoute>} />
        <Route path="staff" element={<ProtectedRoute allowedRoles={['org_admin']}><StaffPage /></ProtectedRoute>} />
        <Route path="staff/new" element={<ProtectedRoute allowedRoles={['org_admin']}><StaffFormPage /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute allowedRoles={['org_admin']}><SettingsPage /></ProtectedRoute>} />
      </Route>
      
      {/* Portal Routes */}
      <Route path="/portal" element={
        <ProtectedRoute>
          <PortalLayout />
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
