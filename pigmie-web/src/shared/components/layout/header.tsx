import { Menu, Languages } from 'lucide-react';
import { useAuth } from '@/shared/hooks/use-auth';
import { useUIStore, useOfflineQueueStore } from '@/shared/stores/app-store';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { ThemeToggle } from '../theme-toggle';
import { useTranslation } from 'react-i18next';

export function Header() {
  const { user } = useAuth();
  const { toggleSidebar } = useUIStore();
  const { pendingCount } = useOfflineQueueStore();
  const { i18n } = useTranslation();

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
        <button
          onClick={() => {
            const newLang = i18n.language === 'en' ? 'hi' : 'en';
            i18n.changeLanguage(newLang);
            localStorage.setItem('pigmie-lang', newLang);
          }}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={i18n.language === 'en' ? 'हिंदी में बदलें' : 'Switch to English'}
        >
          <Languages className="w-5 h-5" />
        </button>
        <NotificationBell />
        <div className="flex items-center gap-3 pl-4 border-l border-border dark:border-border border-black/10">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground">{(user as any)?.fullName}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.userType === 'staff' ? user.role.replace('_', ' ') : 'Customer'}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-500 flex items-center justify-center text-foreground font-semibold">
            {(user as any)?.fullName?.charAt(0) || 'U'}
          </div>
        </div>
      </div>
    </header>
  );
}
