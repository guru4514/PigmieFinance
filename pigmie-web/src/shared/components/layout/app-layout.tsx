import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { MobileBottomNav } from './mobile-bottom-nav';

export function AppLayout() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {isOffline && (
        <div className="bg-amber-500 text-amber-950 text-center py-1 px-4 text-sm font-medium z-50 shrink-0">
          You are offline — cached data will be shown. Collections will sync when back online.
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto bg-background p-4 pb-20 lg:p-8 lg:pb-8">
            <Outlet />
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </div>
  );
}
