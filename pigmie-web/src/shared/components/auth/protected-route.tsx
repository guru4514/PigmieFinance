import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/use-auth';
import { StaffRole } from '@/shared/types';
import { LoadingScreen } from '../ui/loading-spinner';
import axios from 'axios';
import { AccountRecovery } from './account-recovery';

interface ProtectedRouteProps {
  allowedRoles?: StaffRole[];
  requiredUserType?: 'staff' | 'customer';
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, requiredUserType, children }: ProtectedRouteProps) {
  const { user, session, error, retryProfile, isLoading, isMfaVerified } = useAuth();
  
  if (isLoading) return <LoadingScreen />;
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  if (session && error && status !== 401 && status !== 403) {
    return <AccountRecovery authUserId={session.user.id} retry={() => { void retryProfile(); }} />;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.userType === 'unprovisioned') return <Navigate to="/login?error=not_provisioned" replace />;
  if (user.userType === 'staff' && !isMfaVerified) return <Navigate to="/verify-2fa" replace />;
  const destination = user.userType === 'customer' ? '/portal/dashboard' : '/app/dashboard';
  if (requiredUserType && user.userType !== requiredUserType) return <Navigate to={destination} replace />;
  
  if (allowedRoles && (user.userType !== 'staff' || !allowedRoles.includes(user.role))) {
    return <Navigate to={destination} replace />;
  }
  
  return <>{children}</>;
}
