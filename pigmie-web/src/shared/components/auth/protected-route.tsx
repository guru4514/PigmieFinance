import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/use-auth';
import { StaffRole } from '@/shared/types';
import { LoadingScreen } from '../ui/loading-spinner';
import axios from 'axios';

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
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">Connect to recover your workspace</h1>
          <p>We could not verify your account. Reconnect and try again to open your workspace and sync saved collections.</p>
          <p className="text-sm text-muted-foreground">This does not clear collections saved on this device. Avoid clearing site data or uninstalling the app while payments are waiting to sync.</p>
          <button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => { void retryProfile(); }}>Try again</button>
        </div>
      </main>
    );
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
