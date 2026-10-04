import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Banknote, 
  CreditCard, 
  Menu,
  Calculator,
  Wallet,
  FileText,
  Settings,
  LogOut,
  X,
  Package,
  ClipboardCheck,
  UserCog,
  GitBranch,
  ShieldAlert
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAuth } from '@/shared/hooks/use-auth';
import { supabase } from '@/shared/lib/supabase';
import { useTranslation } from 'react-i18next';

export function MobileBottomNav() {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { user } = useAuth();
  
  const userRole = user?.userType === 'staff' ? user.role : null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const mainTabs = [
    { title: 'Home', translationKey: 'nav.home', href: '/app/dashboard', icon: LayoutDashboard },
    { title: 'Customers', translationKey: 'nav.customers', href: '/app/customers', icon: Users },
    { title: 'Collect', translationKey: 'nav.collect', href: '/app/collections/today', icon: Banknote, isPrimary: true },
    { title: 'Loans', translationKey: 'nav.loans', href: '/app/loans', icon: CreditCard },
  ];

  const moreItems = [
    { title: 'Loan Products', translationKey: 'nav.loanProducts', href: '/app/loan-products', icon: Package, roles: ['org_admin', 'branch_manager'] },
    { title: 'EMI Calculator', translationKey: 'nav.emiCalculator', href: '/app/emi-calculator', icon: Calculator, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'] },
    { title: 'Cash Deposits', translationKey: 'nav.cashDeposits', href: '/app/cash-deposits', icon: Wallet, roles: ['org_admin', 'branch_manager', 'agent', 'accountant'] },
    { title: 'Approvals', translationKey: 'nav.approvals', href: '/app/approvals', icon: ClipboardCheck, roles: ['org_admin', 'branch_manager'] },
    { title: 'Reports', translationKey: 'nav.reports', href: '/app/reports', icon: FileText, roles: ['org_admin', 'branch_manager', 'accountant'] },
    { title: 'Staff', translationKey: 'nav.staff', href: '/app/staff', icon: UserCog, roles: ['org_admin'] },
    { title: 'Branches', translationKey: 'nav.branches', href: '/app/branches', icon: GitBranch, roles: ['org_admin'] },
    { title: 'Audit Logs', translationKey: 'nav.auditLogs', href: '/app/audit-logs', icon: ShieldAlert, roles: ['org_admin', 'accountant'] },
    { title: 'Settings', translationKey: 'nav.settings', href: '/app/settings', icon: Settings, roles: ['org_admin'] },
  ];

  const filteredMoreItems = moreItems.filter(item => userRole && item.roles.includes(userRole));

  return (
    <>
      {/* Mobile Bottom Nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-card border-t border-gray-200 dark:border-border pb-safe">
        <div className="flex items-center justify-around h-[68px] px-2">
          {mainTabs.map((tab) => (
            <NavLink
              key={tab.href}
              to={tab.href}
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1",
                isActive 
                  ? (tab.isPrimary ? "text-emerald-600 dark:text-emerald-500" : "text-indigo-600 dark:text-indigo-400") 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "flex items-center justify-center rounded-full transition-all",
                    tab.isPrimary ? "w-11 h-11 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "w-8 h-8",
                    isActive && !tab.isPrimary && "bg-indigo-100 dark:bg-indigo-500/10"
                  )}>
                    <tab.icon className={cn(
                      tab.isPrimary ? "w-6 h-6" : "w-5 h-5",
                      isActive ? "fill-current/20" : ""
                    )} />
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium",
                    tab.isPrimary && "text-emerald-700 dark:text-emerald-400"
                  )}>
                    {(tab as any).translationKey ? t((tab as any).translationKey) : tab.title}
                  </span>
                </>
              )}
            </NavLink>
          ))}
          
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center w-full h-full space-y-1 text-muted-foreground hover:text-foreground"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full transition-all">
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      {/* More Drawer Overlay */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="absolute inset-0" onClick={() => setMoreOpen(false)} />
          <div className="relative bg-white dark:bg-card w-full rounded-t-2xl max-h-[85vh] flex flex-col shadow-xl pb-safe animate-in slide-in-from-bottom-full duration-300">
            <div className="sticky top-0 bg-white dark:bg-card border-b border-gray-100 dark:border-border p-4 flex items-center justify-between z-10 rounded-t-2xl">
              <h2 className="text-lg font-semibold text-foreground">{t('nav.more')}</h2>
              <button 
                onClick={() => setMoreOpen(false)}
                className="p-2 rounded-full bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-2 overflow-y-auto">
              {filteredMoreItems.map((item) => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => cn(
                    "flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-all",
                    isActive 
                      ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" 
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {(item as any).translationKey ? t((item as any).translationKey) : item.title}
                </NavLink>
              ))}
              
              <div className="h-px bg-gray-100 dark:bg-muted my-4" />
              
              <button 
                onClick={handleLogout}
                className="flex items-center gap-3 p-3 w-full rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
