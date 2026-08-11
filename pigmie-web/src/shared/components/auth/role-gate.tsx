import { useAuth } from '@/shared/hooks/use-auth';
import { StaffRole } from '@/shared/types';

interface RoleGateProps {
  allowedRoles: StaffRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { user } = useAuth();

  if (!user || user.userType !== 'staff') {
    return <>{fallback}</>;
  }

  if (allowedRoles.includes(user.role)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
