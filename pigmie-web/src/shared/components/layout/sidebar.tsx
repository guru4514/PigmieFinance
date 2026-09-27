import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, CreditCard, Banknote, FileText, Settings, UserCog, LogOut, X, ShieldAlert, Calculator } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAuth } from '@/shared/hooks/use-auth';
import { useUIStore } from '@/shared/stores/app-store';
import { supabase } from '@/shared/lib/supabase';
import { StaffRole } from '@/shared/types';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  roles: StaffRole[];
  translationKey: string;
}

const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.dashboard' },
  { title: 'Customers', href: '/app/customers', icon: Users, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.customers' },
  { title: 'Loans', href: '/app/loans', icon: CreditCard, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.loans' },
  { title: 'EMI Calculator', href: '/app/emi-calculator', icon: Calculator, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'EMI Calculator' },
  { title: 'Collections', href: '/app/collections/today', icon: Banknote, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.collections' },
  { title: 'Reports', href: '/app/reports', icon: FileText, roles: ['org_admin', 'branch_manager', 'accountant'], translationKey: 'nav.reports' },
  { title: 'Staff', href: '/app/staff', icon: UserCog, roles: ['org_admin'], translationKey: 'nav.staff' },
  { title: 'Audit Logs', href: '/app/audit-logs', icon: ShieldAlert, roles: ['org_admin', 'accountant'], translationKey: 'nav.auditLogs' },
  { title: 'Settings', href: '/app/settings', icon: Settings, roles: ['org_admin'], translationKey: 'nav.settings' },
];

export function Sidebar() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  
  const userRole = user?.userType === 'staff' ? user.role : null;
  const filteredNavItems = navItems.filter(item => userRole && item.roles.includes(userRole));

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 glass border-r border-white/10 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-white/10 shrink-0 justify-between lg:justify-center">
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            Pigmie
          </span>
          <button 
            className="lg:hidden text-muted-foreground hover:text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                isActive 
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon className="w-5 h-5" />
              {t(item.translationKey)}
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-white/10 shrink-0">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all w-full"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
