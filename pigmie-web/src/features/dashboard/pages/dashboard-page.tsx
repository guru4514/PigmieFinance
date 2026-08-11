import { useQuery } from '@tanstack/react-query';
import { Users, Banknote, AlertCircle, TrendingUp, CreditCard, Activity } from 'lucide-react';
import { apiClient } from '../../../shared/lib/api-client';
import { KPICard } from '../components/kpi-card';
import { ReportSummary } from '../../../shared/types';
import { LoadingSpinner } from '../../../shared/components/ui/loading-spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../shared/components/ui/table';
import { Badge } from '../../../shared/components/ui/badge';

export function DashboardPage() {
  const { data: summaryRes, isLoading } = useQuery({
    queryKey: ['reports', 'dashboard-summary'],
    queryFn: () => apiClient.get('/reports/dashboard-summary').then(res => res.data),
  });
  const summary = summaryRes?.data || summaryRes;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (isLoading || !summary) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Dashboard</h1>
        <p className="text-zinc-400">Overview of your micro-finance operations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        <KPICard 
          title="Total Outstanding" 
          value={formatCurrency(summary?.totalOutstanding || 0)} 
          icon={Banknote} 
          className="border-indigo-500/20 bg-indigo-500/5"
          valueClassName="text-indigo-100"
        />
        <KPICard 
          title="Collected Today" 
          value={formatCurrency(summary?.collectedToday || 0)} 
          icon={TrendingUp} 
          className="border-emerald-500/20 bg-emerald-500/5"
          valueClassName="text-emerald-100"
        />
        <KPICard 
          title="Due Today" 
          value={formatCurrency(summary?.dueToday || 0)} 
          icon={Activity} 
        />
        <KPICard 
          title="Active Loans" 
          value={summary?.activeLoans || 0} 
          icon={CreditCard} 
        />
        <KPICard 
          title="Overdue Accounts" 
          value={summary?.overdueCount || 0} 
          icon={AlertCircle} 
          className="border-rose-500/20 bg-rose-500/5"
          valueClassName="text-rose-100"
        />
        <KPICard 
          title="PAR30" 
          value={`${((summary?.portfolioAtRisk30 || 0) * 100).toFixed(1)}%`} 
          icon={Users} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-medium text-white">Today's Due Collections</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={4} className="text-center text-zinc-400 py-8">
                  No due collections today.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Recent Activity</h3>
          <div className="glass rounded-xl p-4 text-center text-zinc-400 py-8">
            No recent activity.
          </div>
        </div>
      </div>
    </div>
  );
}
