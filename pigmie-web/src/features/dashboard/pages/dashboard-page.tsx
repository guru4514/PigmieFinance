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
          value={formatCurrency(summary!.totalOutstanding)} 
          icon={Banknote} 
          trend={2.4}
          className="border-indigo-500/20 bg-indigo-500/5"
          valueClassName="text-indigo-100"
        />
        <KPICard 
          title="Collected Today" 
          value={formatCurrency(summary!.collectedToday)} 
          icon={TrendingUp} 
          trend={12.5}
          trendLabel="vs yesterday"
          className="border-emerald-500/20 bg-emerald-500/5"
          valueClassName="text-emerald-100"
        />
        <KPICard 
          title="Due Today" 
          value={formatCurrency(summary!.dueToday)} 
          icon={Activity} 
        />
        <KPICard 
          title="Active Loans" 
          value={summary!.activeLoans} 
          icon={CreditCard} 
          trend={5}
        />
        <KPICard 
          title="Overdue Accounts" 
          value={summary!.overdueCount} 
          icon={AlertCircle} 
          trend={-2}
          className="border-rose-500/20 bg-rose-500/5"
          valueClassName="text-rose-100"
        />
        <KPICard 
          title="PAR30" 
          value={`${(summary!.portfolioAtRisk30 * 100).toFixed(1)}%`} 
          icon={Users} 
          trend={0.5}
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
              {/* Mock data for now */}
              <TableRow>
                <TableCell className="font-medium text-zinc-200">Ramesh Kumar</TableCell>
                <TableCell className="text-zinc-400">9876543210</TableCell>
                <TableCell>{formatCurrency(250)}</TableCell>
                <TableCell><Badge variant="warning">Pending</Badge></TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-zinc-200">Anita Sharma</TableCell>
                <TableCell className="text-zinc-400">9988776655</TableCell>
                <TableCell>{formatCurrency(500)}</TableCell>
                <TableCell><Badge variant="success">Collected</Badge></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Recent Activity</h3>
          <div className="glass rounded-xl p-4 space-y-4">
            <div className="flex items-start gap-4 pb-4 border-b border-white/5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2"></div>
              <div>
                <p className="text-sm text-zinc-200">Payment collected from <span className="font-medium">Ramesh</span></p>
                <p className="text-xs text-zinc-500 mt-1">10 mins ago</p>
              </div>
            </div>
            <div className="flex items-start gap-4 pb-4 border-b border-white/5">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2"></div>
              <div>
                <p className="text-sm text-zinc-200">New loan approved for <span className="font-medium">Sunita</span></p>
                <p className="text-xs text-zinc-500 mt-1">2 hours ago</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-rose-500 mt-2"></div>
              <div>
                <p className="text-sm text-zinc-200">Loan <span className="font-medium">L-893</span> marked as overdue</p>
                <p className="text-xs text-zinc-500 mt-1">5 hours ago</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
