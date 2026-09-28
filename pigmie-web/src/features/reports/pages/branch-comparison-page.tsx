import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export function BranchComparisonPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['branch-comparison'],
    queryFn: async () => {
      const res = await apiClient.get('/reports/branch-comparison');
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const branches = data?.data || [];
  
  // Find max values for progress bars
  const maxOutstanding = Math.max(...branches.map((b: any) => b.total_outstanding_amount || 0), 1);
  const maxCollections = Math.max(...branches.map((b: any) => b.collections_this_month || 0), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Branch Comparison</h1>
        <p className="text-muted-foreground">Compare performance metrics across branches</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {branches.map((branch: any) => (
              <div key={branch.branch_id} className="space-y-2">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span>{branch.branch_name}</span>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Outstanding: {formatCurrency(branch.total_outstanding_amount)}</span>
                    <span>Collections: {formatCurrency(branch.collections_this_month)}</span>
                  </div>
                  <div className="relative w-full h-3 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="absolute top-0 left-0 h-full bg-blue-500 rounded-full opacity-70"
                      style={{ width: `${(branch.total_outstanding_amount / maxOutstanding) * 100}%` }}
                    />
                    <div 
                      className="absolute top-0 left-0 h-full bg-green-500 rounded-full"
                      style={{ width: `${(branch.collections_this_month / maxCollections) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {branches.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No branch data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Agents</TableHead>
                  <TableHead className="text-right">Active Loans</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Outstanding Amount</TableHead>
                  <TableHead className="text-right">Collections This Month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No branch data available
                    </TableCell>
                  </TableRow>
                ) : (
                  branches.map((branch: any) => (
                    <TableRow key={branch.branch_id}>
                      <TableCell className="font-medium">{branch.branch_name}</TableCell>
                      <TableCell className="text-right">{branch.number_of_customers}</TableCell>
                      <TableCell className="text-right">{branch.number_of_agents}</TableCell>
                      <TableCell className="text-right">{branch.active_loans_count}</TableCell>
                      <TableCell className="text-right">
                        <span className={branch.overdue_count > 0 ? 'text-destructive font-medium' : ''}>
                          {branch.overdue_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(branch.total_outstanding_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(branch.collections_this_month)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
