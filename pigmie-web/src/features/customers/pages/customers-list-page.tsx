import React from 'react';
import { useCustomers } from '../hooks/use-customers';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { LoadingSpinner } from '@/shared/components/ui/loading-spinner';
import { Plus, Search, MoreHorizontal, Users } from 'lucide-react';
import { Input } from '@/shared/components/ui/input';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { useAuth } from '@/shared/hooks/use-auth';
import { RoleGate } from '@/shared/components/auth/role-gate';
import { useTranslation } from 'react-i18next';

export const CustomersListPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAccountant = user?.userType === 'staff' && user.role === 'accountant';
  const [filterMode, setFilterMode] = React.useState<'all' | 'my'>('all');
  const { data: customersResponse, isLoading } = useCustomers(filterMode === 'my' ? { agentId: (user as any)?.id } : undefined);
  const customers = customersResponse?.data || [];

  const [searchQuery, setSearchQuery] = React.useState('');
  const [kycFilter, setKycFilter] = React.useState<string>('all');
  
  const filteredCustomers = React.useMemo(() => {
    let result = customers;
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      result = result.filter((c: any) => 
        c.fullName?.toLowerCase().includes(lower) || 
        c.phone?.includes(lower)
      );
    }
    if (kycFilter !== 'all') {
      result = result.filter((c: any) => c.kycStatus === kycFilter);
    }
    return result;
  }, [customers, searchQuery, kycFilter]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[400px]">
        <LoadingSpinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('customers.title')}</h1>
          <p className="text-muted-foreground mt-1 text-muted-foreground">{t('customers.subtitle')}</p>
        </div>
        <RoleGate allowedRoles={['org_admin', 'branch_manager', 'agent']}>
          <div className="flex gap-2">
            <Link to="/app/customers/import">
              <Button variant="outline" className="border-border text-foreground/80 hover:bg-muted hover:text-foreground">
                {t('customers.importCsv')}
              </Button>
            </Link>
            <Link to="/app/customers/new">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                <Plus className="w-4 h-4" /> {t('customers.addCustomer')}
              </Button>
            </Link>
          </div>
        </RoleGate>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder={t('customers.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted border-border text-foreground w-full max-w-md"
          />
        </div>
        <div className="flex gap-2 items-center">
          <select 
            className="bg-muted border border-border text-foreground rounded-md px-3 py-2 text-sm max-w-xs"
            value={kycFilter}
            onChange={(e) => setKycFilter(e.target.value)}
          >
            <option value="all">{t('customers.allKyc')}</option>
            <option value="not_submitted">{t('customers.notSubmitted')}</option>
            <option value="submitted">{t('customers.submitted')}</option>
            <option value="verified">{t('customers.verified')}</option>
            <option value="rejected">{t('customers.rejected')}</option>
          </select>
          <Button 
            variant={filterMode === 'all' ? 'default' : 'outline'} 
            onClick={() => setFilterMode('all')}
            className={filterMode === 'all' ? '' : 'border-border text-foreground/80'}
          >
            {t('loans.all')}
          </Button>
          <Button 
            variant={filterMode === 'my' ? 'default' : 'outline'} 
            onClick={() => setFilterMode('my')}
            className={filterMode === 'my' ? '' : 'border-border text-foreground/80'}
          >
            {t('loans.myAssignments')}
          </Button>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
          <EmptyState 
            icon={Users} 
            title={t('customers.noCustomers')} 
            description={t('customers.noCustomersDesc')} 
            actionLabel={isAccountant ? undefined : t('customers.addCustomer')} 
            actionHref={isAccountant ? undefined : "/app/customers/new"} 
          />
        ) : (
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t('customers.name')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('customers.contact')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('dashboard.status')}</TableHead>
                  <TableHead className="text-muted-foreground">KYC</TableHead>
                  <TableHead className="text-muted-foreground">{t('customers.joinDate')}</TableHead>
                  <TableHead className="text-muted-foreground text-right">{t('loans.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer: any) => (
                  <TableRow key={customer.id} className="border-border hover:bg-muted">
                    <TableCell className="font-medium text-foreground">
                      {customer.fullName}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-foreground/80">{customer.email || 'N/A'}</div>
                      <div className="text-xs text-muted-foreground">{customer.phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={customer.isActive ? 'default' : 'secondary'}
                        className={
                          customer.isActive ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20' : 
                          'bg-muted text-muted-foreground border-muted-foreground/20'
                        }
                      >
                        {customer.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline"
                        className={
                          customer.kycStatus === 'verified' ? 'border-emerald-500 text-emerald-500' :
                          customer.kycStatus === 'rejected' ? 'border-red-500 text-red-500' :
                          customer.kycStatus === 'submitted' ? 'border-amber-500 text-amber-500' :
                          'border-border text-muted-foreground'
                        }
                      >
                        {customer.kycStatus?.replace('_', ' ').toUpperCase() || t('customers.notSubmittedCaps')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Link to={`/app/customers/${customer.id}`}>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
    </div>
  );
};
