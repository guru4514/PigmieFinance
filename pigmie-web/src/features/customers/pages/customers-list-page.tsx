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

export const CustomersListPage = () => {
  const { user } = useAuth();
  const isAccountant = user?.userType === 'staff' && user.role === 'accountant';
  const [filterMode, setFilterMode] = React.useState<'all' | 'my'>('all');
  const { data: customersResponse, isLoading } = useCustomers(filterMode === 'my' ? { assignedAgentId: (user as any)?.id } : undefined);
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
          <h1 className="text-3xl font-bold tracking-tight text-white">Customers</h1>
          <p className="text-muted-foreground mt-1 text-zinc-400">Manage your customer base and view their details.</p>
        </div>
        {!isAccountant && (
          <div className="flex gap-2">
            <Link to="/app/customers/import">
              <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                Import CSV
              </Button>
            </Link>
            <Link to="/app/customers/new">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
                <Plus className="w-4 h-4" /> Add Customer
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input 
            placeholder="Search customers..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-zinc-800/50 border-zinc-700 text-white w-full max-w-md"
          />
        </div>
        <div className="flex gap-2">
          <Button 
            variant={filterMode === 'all' ? 'default' : 'outline'} 
            onClick={() => setFilterMode('all')}
            className={filterMode === 'all' ? '' : 'border-zinc-700 text-zinc-300'}
          >
            All
          </Button>
          <Button 
            variant={filterMode === 'my' ? 'default' : 'outline'} 
            onClick={() => setFilterMode('my')}
            className={filterMode === 'my' ? '' : 'border-zinc-700 text-zinc-300'}
          >
            My Assignments
          </Button>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
          <EmptyState 
            icon={Users} 
            title="No customers yet" 
            description="Get started by adding your first customer to the system." 
            actionLabel={isAccountant ? undefined : "Add Customer"} 
            actionHref={isAccountant ? undefined : "/app/customers/new"} 
          />
        ) : (
          <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50">
            <Table>
              <TableHeader className="bg-zinc-800/50">
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Name</TableHead>
                  <TableHead className="text-zinc-400">Contact</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">KYC</TableHead>
                  <TableHead className="text-zinc-400">Join Date</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer: any) => (
                  <TableRow key={customer.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="font-medium text-white">
                      {customer.fullName}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-zinc-300">{customer.email || 'N/A'}</div>
                      <div className="text-xs text-zinc-500">{customer.phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={customer.status === 'active' ? 'default' : customer.status === 'pending' ? 'outline' : 'secondary'}
                        className={
                          customer.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20' : 
                          customer.status === 'pending' ? 'border-amber-500/50 text-amber-500' :
                          'bg-zinc-800 text-zinc-400'
                        }
                      >
                        {customer.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline"
                        className={
                          customer.kycStatus === 'verified' ? 'border-emerald-500 text-emerald-500' :
                          customer.kycStatus === 'rejected' ? 'border-red-500 text-red-500' :
                          customer.kycStatus === 'submitted' ? 'border-amber-500 text-amber-500' :
                          'border-zinc-500 text-zinc-500'
                        }
                      >
                        {customer.kycStatus?.replace('_', ' ').toUpperCase() || 'NOT SUBMITTED'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-400">{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                      <Link to={`/app/customers/${customer.id}`}>
                        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-800">
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
