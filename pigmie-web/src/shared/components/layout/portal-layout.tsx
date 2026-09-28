import { Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/shared/hooks/use-auth';
import { Button } from '../ui/button';

export function PortalLayout() {
  const { user } = useAuth();
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="h-16 glass border-b border-border flex items-center justify-between px-4 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Pigmie Portal
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Hello, <span className="text-foreground font-medium">{user?.fullName}</span></span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
