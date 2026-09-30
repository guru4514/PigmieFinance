import React from 'react';
import { useLoans } from '../hooks/use-loans';
import { LoanStatusBadge } from '../components/loan-status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Plus, Search, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RoleGate } from '@/shared/components/auth/role-gate';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { useAuth } from '@/shared/hooks/use-auth';
import { useTranslation } from 'react-i18next';

export const LoansListPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAccountant = user?.userType === 'staff' && user.role === 'accountant';
  const [filterMode, setFilterMode] = React.useState<'all' | 'my'>('all');
  const { data: loansResponse, isLoading: loading } = useLoans(filterMode === 'my' ? { agentId: (user as any)?.id } : undefined);
  const loans = loansResponse?.data || [];

  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredLoans = React.useMemo(() => {
    if (!searchQuery) return loans;
    const lower = searchQuery.toLowerCase();
    return loans.filter((l: any) => 
      l.id?.toLowerCase().includes(lower) || 
      (l.customer?.fullName || l.customerId)?.toLowerCase().includes(lower)
    );
  }, [loans, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('loans.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('loans.subtitle')}</p>
        </div>
        <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
          <Link to="/app/loans/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              <Plus className="h-4 w-4" />
              {t('loans.newLoan')}
            </Button>
          </Link>
        </RoleGate>
      </div>

      <Card className="border-border bg-card backdrop-blur-xl">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
              {t('loans.allLoans')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button 
                variant={filterMode === 'all' ? 'default' : 'outline'} 
                onClick={() => setFilterMode('all')}
                size="sm"
                className={filterMode === 'all' ? '' : 'border-border text-foreground/80'}
              >
                {t('loans.all')}
              </Button>
              <Button 
                variant={filterMode === 'my' ? 'default' : 'outline'} 
                onClick={() => setFilterMode('my')}
                size="sm"
                className={filterMode === 'my' ? '' : 'border-border text-foreground/80'}
              >
                {t('loans.myAssignments')}
              </Button>
              <div className="relative ml-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder={t('loans.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full sm:w-64 bg-muted border-border text-foreground placeholder:text-muted-foreground h-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">{t('loans.loading')}</div>
          ) : filteredLoans.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title={t('loans.noActive')}
                description={t('loans.noActiveDesc')}
                actionLabel={isAccountant ? undefined : t('loans.newLoan')}
                actionHref={isAccountant ? undefined : "/app/loans/new"}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-foreground/80">
                <thead className="bg-muted text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">{t('loans.loanId')}</th>
                    <th className="px-6 py-4 font-medium">{t('loans.borrower')}</th>
                    <th className="px-6 py-4 font-medium">{t('dashboard.amount')}</th>
                    <th className="px-6 py-4 font-medium">{t('loans.balance')}</th>
                    <th className="px-6 py-4 font-medium">{t('dashboard.status')}</th>
                    <th className="px-6 py-4 font-medium text-right">{t('loans.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredLoans.map((loan: any) => (
                    <tr key={loan.id} className="hover:bg-muted transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{loan.id.slice(0, 8)}</td>
                      <td className="px-6 py-4">{loan.customer?.fullName || loan.customerId}</td>
                      <td className="px-6 py-4 font-medium">₹{(loan.principalAmount || loan.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-6 py-4">
                        {['active', 'closed', 'defaulted', 'written_off'].includes(loan.status) 
                          ? `₹${(loan.outstandingBalance || 0).toLocaleString('en-IN')}`
                          : <span className="text-muted-foreground text-sm" title={t('loans.notDisbursed')}>—</span>
                        }
                      </td>
                      <td className="px-6 py-4">
                        <LoanStatusBadge status={loan.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link to={`/app/loans/${loan.id}`}>
                          <Button variant="ghost" size="sm" className="text-primary hover:text-primary-foreground hover:bg-primary/20">
                            {t('loans.view')}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

