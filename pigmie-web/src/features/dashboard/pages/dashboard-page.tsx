import { useQuery } from '@tanstack/react-query';
import { Users, Banknote, AlertCircle, TrendingUp, CreditCard, Activity } from 'lucide-react';
import { apiClient } from '../../../shared/lib/api-client';
import { KPICard } from '../components/kpi-card';
import { LoadingSpinner } from '../../../shared/components/ui/loading-spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../shared/components/ui/table';
import { Badge } from '../../../shared/components/ui/badge';
import { useCollectionsToday } from '../../collections/hooks/use-collections';
import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: summaryRes, isLoading } = useQuery({
    queryKey: ['reports', 'dashboard-summary'],
    queryFn: () => apiClient.get('/reports/dashboard-summary').then(res => res.data),
  });
  const summary = summaryRes?.data || summaryRes;

  const { data: collectionsRaw } = useCollectionsToday();
  const dueCollections = Array.isArray(collectionsRaw) ? collectionsRaw : collectionsRaw?.data || [];

  const { data: activityRes } = useQuery({
    queryKey: ['dashboard', 'recent-activity'],
    queryFn: () => apiClient.get('/audit-logs?limit=5').then(res => res.data).catch(() => []),
  });
  const activities = activityRes?.data || activityRes || [];

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
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        <KPICard 
          title={t('dashboard.totalOutstanding')} 
          value={formatCurrency(summary?.totalOutstanding || 0)} 
          icon={Banknote} 
          className="border-indigo-500/20 bg-indigo-500/5"
          valueClassName="text-indigo-600 dark:text-indigo-400"
        />
        <KPICard 
          title={t('dashboard.collectedToday')} 
          value={formatCurrency(summary?.collectedToday || 0)} 
          icon={TrendingUp} 
          className="border-emerald-500/20 bg-emerald-500/5"
          valueClassName="text-emerald-600 dark:text-emerald-400"
        />
        <KPICard 
          title={t('dashboard.dueToday')} 
          value={formatCurrency(summary?.dueToday || 0)} 
          icon={Activity} 
        />
        <KPICard 
          title={t('dashboard.activeLoans')} 
          value={summary?.activeLoans || 0} 
          icon={CreditCard} 
        />
        <KPICard 
          title={t('dashboard.overdueAccounts')} 
          value={summary?.overdueCount || 0} 
          icon={AlertCircle} 
          className="border-rose-500/20 bg-rose-500/5"
          valueClassName="text-rose-600 dark:text-rose-400"
        />
        <KPICard 
          title={t('dashboard.par30')} 
          value={`${((summary?.portfolioAtRisk30 || 0) * 100).toFixed(1)}%`} 
          icon={Users} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-medium text-foreground">{t('dashboard.todaysDueCollections')}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.customer')}</TableHead>
                <TableHead>{t('dashboard.phone')}</TableHead>
                <TableHead>{t('dashboard.amount')}</TableHead>
                <TableHead>{t('dashboard.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dueCollections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {t('dashboard.noDueCollections')}
                  </TableCell>
                </TableRow>
              ) : (
                dueCollections.slice(0, 5).map((loan: any) => {
                  const hasDueItems = loan.dueItems && loan.dueItems.length > 0;
                  const amountDue = hasDueItems ? loan.dueItems.reduce((acc: number, item: any) => acc + Number(item.remaining), 0) : 0;
                  
                  let statusLabel = 'N/A';
                  let statusColor = 'text-muted-foreground';
                  
                  if (hasDueItems) {
                    if (amountDue <= 0) {
                      statusLabel = t('dashboard.collected');
                      statusColor = 'text-emerald-500';
                    } else {
                      statusLabel = t('dashboard.pending');
                      statusColor = 'text-amber-500';
                    }
                  } else {
                    statusLabel = t('dashboard.noDue');
                    statusColor = 'text-muted-foreground';
                  }

                  return (
                    <TableRow key={loan.loanId}>
                      <TableCell className="font-medium text-foreground">{loan.customer?.fullName}</TableCell>
                      <TableCell className="text-foreground">{loan.customer?.phone}</TableCell>
                      <TableCell>{formatCurrency(amountDue)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor}>
                          {statusLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-foreground">{t('dashboard.recentActivity')}</h3>
          {activities.length > 0 ? (
            <div className="space-y-3">
              {activities.map((activity: any) => (
                <div key={activity.id} className="glass rounded-xl p-3 flex flex-col gap-1 border border-border bg-card">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-foreground">{activity.action}</span>
                    <span className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleDateString()}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{t('dashboard.entity')}: {activity.entityType}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-xl p-4 text-center text-muted-foreground py-8">
              {t('dashboard.noRecentActivity')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
