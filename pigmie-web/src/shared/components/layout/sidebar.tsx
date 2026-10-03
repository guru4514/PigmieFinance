import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, Users, CreditCard, Banknote, FileText, 
  Settings, UserCog, LogOut, X, ShieldAlert, Calculator, 
  ClipboardCheck, GitBranch, Wallet, Package, Search 
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAuth } from '@/shared/hooks/use-auth';
import { useUIStore } from '@/shared/stores/app-store';
import { supabase } from '@/shared/lib/supabase';
import { StaffRole } from '@/shared/types';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  roles: StaffRole[];
  translationKey: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Daily',
    items: [
      { title: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.dashboard' },
      { title: 'Customers', href: '/app/customers', icon: Users, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.customers' },
      { title: 'Collections', href: '/app/collections/today', icon: Banknote, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.collections' },
      { title: 'Loans', href: '/app/loans', icon: CreditCard, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.loans' },
    ]
  },
  {
    label: 'Tools',
    items: [
      { title: 'EMI Calculator', href: '/app/emi-calculator', icon: Calculator, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'EMI Calculator' },
      { title: 'Cash Deposits', href: '/app/cash-deposits', icon: Wallet, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'], translationKey: 'nav.cashDeposits' },
    ]
  },
  {
    label: 'Management',
    items: [
      { title: 'Staff', href: '/app/staff', icon: UserCog, roles: ['org_admin'], translationKey: 'nav.staff' },
      { title: 'Branches', href: '/app/branches', icon: GitBranch, roles: ['org_admin'], translationKey: 'nav.branches' },
      { title: 'Loan Products', href: '/app/loan-products', icon: Package, roles: ['org_admin', 'branch_manager'], translationKey: 'Loan Products' },
      { title: 'Approvals', href: '/app/approvals', icon: ClipboardCheck, roles: ['org_admin', 'branch_manager'], translationKey: 'Approvals' },
    ]
  },
  {
    label: 'Insights',
    items: [
      { title: 'Reports', href: '/app/reports', icon: FileText, roles: ['org_admin', 'branch_manager', 'accountant'], translationKey: 'nav.reports' },
      { title: 'Audit Logs', href: '/app/audit-logs', icon: ShieldAlert, roles: ['org_admin', 'accountant'], translationKey: 'nav.auditLogs' },
    ]
  },
  {
    label: 'System',
    items: [
      { title: 'Settings', href: '/app/settings', icon: Settings, roles: ['org_admin'], translationKey: 'nav.settings' },
    ]
  }
];

export function Sidebar() {
  const { t } = useTranslation();
  useTranslation('common');
  const { user } = useAuth();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  
  const userRole = user?.userType === 'staff' ? user.role : null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const { data: pendingApprovals } = useQuery({
    queryKey: ['pending-approvals-count'],
    queryFn: async () => {
      if (userRole === 'org_admin' || userRole === 'branch_manager') {
        const res = await apiClient.get('/approvals/pending/count');
        return res.data?.count || 0;
      }
      return 0;
    },
    enabled: userRole === 'org_admin' || userRole === 'branch_manager',
    refetchInterval: 60000,
  });

  const handleSearchEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/app/customers?search=${encodeURIComponent(searchQuery.trim())}`);
      if (window.innerWidth < 1024) setSidebarOpen(false);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static",
        sidebarOpen ? "translate-x-0" : "-translate-x-full hidden lg:flex"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-border shrink-0 justify-between lg:justify-center">
          <span className="text-xl font-bold bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">
            Pigmie
          </span>
          <button 
            className="lg:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchEnter}
              className="w-full bg-muted/50 border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {navGroups.map((group) => {
            const groupItems = group.items.filter(
              item => userRole && item.roles.includes(userRole) && 
              item.title.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (groupItems.length === 0) return null;

            return (
              <div key={group.label} className="px-3">
                <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </h3>
                <div className="space-y-0.5">
                  {groupItems.map((item) => (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
                      className={({ isActive }) => cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all group justify-between",
                        isActive 
                          ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border-l-2 border-indigo-500 rounded-l-none" 
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-2 border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="w-4 h-4" />
                        {t(item.translationKey) || item.title}
                      </div>
                      {item.title === 'Approvals' && pendingApprovals > 0 && (
                        <span className="bg-red-500 text-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {pendingApprovals}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-border shrink-0">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all w-full"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

