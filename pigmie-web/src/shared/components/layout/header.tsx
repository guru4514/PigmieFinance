import { Bell, Menu } from 'lucide-react';
import { useAuth } from '@/shared/hooks/use-auth';
import { useUIStore, useOfflineQueueStore } from '@/shared/stores/app-store';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { ThemeToggle } from '../theme-toggle';

export function Header() {
  const { user } = useAuth();
  const { toggleSidebar } = useUIStore();
  const { pendingCount } = useOfflineQueueStore();

  return (
    <header className="h-16 glass border-b border-border flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="lg:hidden text-muted-foreground hover:text-foreground"
          onClick={toggleSidebar}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="hidden sm:block">
          {pendingCount > 0 && (
            <Badge variant="warning" className="animate-pulse">
              {pendingCount} pending sync
            </Badge>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <NotificationBell />
        <div className="flex items-center gap-3 pl-4 border-l border-border dark:border-border border-black/10">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground">{user?.fullName}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.userType === 'staff' ? user.role.replace('_', ' ') : 'Customer'}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center text-foreground font-semibold">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
        </div>
      </div>
    </header>
  );
}
