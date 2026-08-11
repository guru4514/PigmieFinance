import React from 'react';
import { useLoans } from '../hooks/use-loans';
import { LoanStatusBadge } from '../components/loan-status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Plus, Search, Filter, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RoleGate } from '@/shared/components/auth/role-gate';
import { EmptyState } from '@/shared/components/ui/empty-state';

export const LoansListPage: React.FC = () => {
  const { data: loansResponse, isLoading: loading } = useLoans();
  const loans = loansResponse?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Loans</h1>
          <p className="text-sm text-gray-400 mt-1">Manage and track all loan accounts</p>
        </div>
        <RoleGate allowedRoles={['ADMIN', 'MANAGER', 'AGENT']}>
          <Link to="/app/loans/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              <Plus className="h-4 w-4" />
              New Loan
            </Button>
          </Link>
        </RoleGate>
      </div>

      <Card className="border-white/10 bg-black/40 backdrop-blur-xl">
        <CardHeader className="border-b border-white/5 pb-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle className="text-lg font-medium text-white flex items-center gap-2">
              All Loans
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search loans..." 
                  className="pl-9 w-full sm:w-64 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
              <Button variant="outline" size="icon" className="border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading loans...</div>
          ) : loans.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title="No active loans"
                description="There are no loans in the system. Create a new loan to get started."
                actionLabel="New Loan"
                actionHref="/app/loans/new"
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-white/5 text-xs uppercase text-gray-400 border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4 font-medium">Loan ID</th>
                    <th className="px-6 py-4 font-medium">Borrower</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Balance</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {loans.map((loan: any) => (
                    <tr key={loan.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 font-medium text-white">{loan.id.slice(0, 8)}</td>
                      <td className="px-6 py-4">{loan.customer?.fullName || loan.customerId}</td>
                      <td className="px-6 py-4 font-medium">₹{(loan.principalAmount || loan.amount || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">₹{(loan.remainingBalance || 0).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <LoanStatusBadge status={loan.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link to={`/app/loans/${loan.id}`}>
                          <Button variant="ghost" size="sm" className="text-primary hover:text-primary-foreground hover:bg-primary/20">
                            View
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

