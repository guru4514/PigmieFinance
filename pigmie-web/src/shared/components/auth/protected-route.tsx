import { Navigate } from 'react-router-dom';
import { useAuth } from '@/shared/hooks/use-auth';
import { StaffRole } from '@/shared/types';
import { LoadingScreen } from '../ui/loading-spinner';

interface ProtectedRouteProps {
  allowedRoles?: StaffRole[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.userType === 'unprovisioned') return <Navigate to="/login?error=not_provisioned" replace />;
  
  if (allowedRoles && (user.userType !== 'staff' || !allowedRoles.includes(user.role))) {
    return <Navigate to="/app/dashboard" replace />;
  }
  
  return <>{children}</>;
}
