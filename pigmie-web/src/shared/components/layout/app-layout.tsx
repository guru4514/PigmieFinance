import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { MobileBottomNav } from './mobile-bottom-nav';

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background p-4 pb-20 lg:p-8 lg:pb-8">
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}
